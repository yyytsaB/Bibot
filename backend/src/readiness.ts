export interface OllamaConfig {
  baseUrl: string;
  chatEndpoint: string;
  tagsEndpoint: string;
  model: string;
  timeoutMs: number;
}

export interface OllamaConfigOverrides {
  baseUrl?: string | undefined;
  chatEndpoint?: string | undefined;
  tagsEndpoint?: string | undefined;
  model?: string | undefined;
  timeoutMs?: number | undefined;
}

export function resolveOllamaConfig(overrides?: OllamaConfigOverrides): OllamaConfig {
  const model = overrides?.model ?? process.env["OLLAMA_MODEL"] ?? "qwen2.5:7b";
  const baseUrl = (
    overrides?.baseUrl ??
    process.env["OLLAMA_BASE_URL"] ??
    "http://127.0.0.1:11434"
  ).replace(/\/+$/, "");
  const chatEndpoint =
    overrides?.chatEndpoint ??
    process.env["OLLAMA_ENDPOINT"] ??
    `${baseUrl}/api/chat`;
  const tagsEndpoint =
    overrides?.tagsEndpoint ??
    `${baseUrl}/api/tags`;
  const timeoutMs =
    overrides?.timeoutMs ??
    parseInt(process.env["OLLAMA_TIMEOUT_MS"] ?? "15000", 10);

  return {
    baseUrl,
    chatEndpoint,
    tagsEndpoint,
    model,
    timeoutMs,
  };
}

export interface ReadinessResponse {
  isReady: boolean;
  statusLabel: "Local AI Ready" | "Local AI Unavailable";
  detail: string;
  model: string;
  consecutiveFailures: number;
}

export interface Scheduler {
  setTimeout: (callback: () => void, ms: number) => unknown;
  clearTimeout: (timer: unknown) => void;
}

export interface ReadinessServiceOptions {
  config: OllamaConfig;
  checkIntervalMs?: number | undefined;
  checkTimeoutMs?: number | undefined;
  warmUpTimeoutMs?: number | undefined;
  fetchFn?: typeof fetch | undefined;
  scheduler?: Scheduler | undefined;
  createTimeoutSignal?: ((ms: number) => AbortSignal) | undefined;
}

export function matchesExactModel(candidateName: string, targetModel: string): boolean {
  if (candidateName === targetModel) {
    return true;
  }
  // If target has no tag (e.g. "llama3.2"), Ollama often tags it as "llama3.2:latest"
  if (!targetModel.includes(":")) {
    if (candidateName === `${targetModel}:latest`) {
      return true;
    }
  }
  // If target has ":latest", also match unadorned candidate name if Ollama returned it
  if (targetModel.endsWith(":latest")) {
    const unadorned = targetModel.slice(0, -7);
    if (candidateName === unadorned) {
      return true;
    }
  }
  return false;
}

export class ReadinessService {
  readonly config: OllamaConfig;
  readonly checkIntervalMs: number;
  readonly checkTimeoutMs: number;
  readonly warmUpTimeoutMs: number;

  private readonly fetchFn: typeof fetch;
  private readonly scheduler: Scheduler;
  private readonly createTimeoutSignal: (ms: number) => AbortSignal;

  private state: ReadinessResponse;
  private hasWarmUpSucceeded: boolean = false;
  private warmUpFailed: boolean = false;
  private isStopped: boolean = false;
  private activeTimer: unknown = null;
  private hasStarted: boolean = false;
  private inFlightStart: Promise<void> | null = null;
  private inFlightCheck: Promise<boolean> | null = null;
  private inFlightWarmUp: Promise<boolean> | null = null;
  private activeAbortController: AbortController | null = null;

  constructor(options: ReadinessServiceOptions) {
    this.config = options.config;
    this.checkIntervalMs = options.checkIntervalMs ?? 15_000;
    this.checkTimeoutMs = options.checkTimeoutMs ?? 2_000;
    this.warmUpTimeoutMs = options.warmUpTimeoutMs ?? 15_000;
    this.fetchFn = options.fetchFn ?? globalThis.fetch.bind(globalThis);
    this.scheduler = options.scheduler ?? {
      setTimeout: (cb: () => void, ms: number) => globalThis.setTimeout(cb, ms),
      clearTimeout: (timer: unknown) => {
        if (typeof timer === "number" || (typeof timer === "object" && timer !== null)) {
          globalThis.clearTimeout(timer as NodeJS.Timeout);
        }
      },
    };
    this.createTimeoutSignal =
      options.createTimeoutSignal ?? ((ms: number) => AbortSignal.timeout(ms));

    this.state = {
      isReady: false,
      statusLabel: "Local AI Unavailable",
      detail: "Readiness check has not yet run",
      model: this.config.model,
      consecutiveFailures: 0,
    };
  }

  getReadiness(): ReadinessResponse {
    return { ...this.state };
  }

  async checkAvailability(): Promise<boolean> {
    if (this.isStopped) {
      return false;
    }

    if (this.inFlightCheck) {
      return this.inFlightCheck;
    }

    const checkPromise = (async (): Promise<boolean> => {
      const timeoutSignal = this.createTimeoutSignal(this.checkTimeoutMs);
      const abortCtrl = new AbortController();
      this.activeAbortController = abortCtrl;
      const combinedSignal = AbortSignal.any([abortCtrl.signal, timeoutSignal]);

      try {
        const response = await this.fetchFn(this.config.tagsEndpoint, {
          method: "GET",
          headers: { Accept: "application/json" },
          signal: combinedSignal,
        });

        if (!response.ok) {
          throw new Error(`Ollama returned HTTP ${response.status} ${response.statusText}`);
        }

        const bodyText = await response.text();
        const data = JSON.parse(bodyText) as {
          models?: Array<{ name?: string; model?: string }>;
        };

        if (!data || !Array.isArray(data.models)) {
          throw new Error("Invalid response format: 'models' array missing from /api/tags");
        }

        const modelFound = data.models.some((m) => {
          const name = typeof m.name === "string" ? m.name : "";
          const model = typeof m.model === "string" ? m.model : "";
          return (
            matchesExactModel(name, this.config.model) ||
            (model.length > 0 && matchesExactModel(model, this.config.model))
          );
        });

        if (!modelFound) {
          throw new Error(`Configured model '${this.config.model}' not found in Ollama tags`);
        }

        if (this.isStopped) {
          return false;
        }

        this.handleCheckSuccess();
        return true;
      } catch (err: unknown) {
        if (this.isStopped) {
          return false;
        }
        const message = err instanceof Error ? err.message : String(err);
        this.handleCheckFailure(message);
        return false;
      } finally {
        if (this.activeAbortController === abortCtrl) {
          this.activeAbortController = null;
        }
        this.inFlightCheck = null;
      }
    })();

    this.inFlightCheck = checkPromise;
    return checkPromise;
  }

  private handleCheckSuccess(): void {
    if (this.isStopped) {
      return;
    }

    this.state.consecutiveFailures = 0;

    if (this.warmUpFailed) {
      this.state.isReady = false;
      this.state.statusLabel = "Local AI Unavailable";
      this.state.detail = `Model '${this.config.model}' is available, but startup warm-up failed. Restart backend to re-attempt warm-up.`;
      return;
    }

    if (this.hasWarmUpSucceeded) {
      this.state.isReady = true;
      this.state.statusLabel = "Local AI Ready";
      this.state.detail = `Operational availability confirmed for model '${this.config.model}'`;
    } else {
      this.state.isReady = false;
      this.state.statusLabel = "Local AI Unavailable";
      this.state.detail = `Model '${this.config.model}' is available; initial warm-up required`;
    }
  }

  private handleCheckFailure(reason: string): void {
    if (this.isStopped) {
      return;
    }

    this.state.consecutiveFailures += 1;

    if (this.state.consecutiveFailures >= 2) {
      this.state.isReady = false;
      this.state.statusLabel = "Local AI Unavailable";
      this.state.detail = `Availability check failed (${this.state.consecutiveFailures} consecutive failures): ${reason}`;
    } else {
      if (this.state.isReady) {
        this.state.detail = `Warning: transient check failure (1/2): ${reason}`;
      } else {
        this.state.detail = `Availability check failed: ${reason}`;
      }
    }
  }

  async performWarmUp(): Promise<boolean> {
    if (this.isStopped) {
      return false;
    }

    if (this.warmUpFailed) {
      return false;
    }

    if (this.hasWarmUpSucceeded) {
      return true;
    }

    if (this.inFlightWarmUp) {
      return this.inFlightWarmUp;
    }

    const warmUpPromise = (async (): Promise<boolean> => {
      const timeoutSignal = this.createTimeoutSignal(this.warmUpTimeoutMs);
      const abortCtrl = new AbortController();
      this.activeAbortController = abortCtrl;
      const combinedSignal = AbortSignal.any([abortCtrl.signal, timeoutSignal]);

      try {
        const payload = {
          model: this.config.model,
          messages: [{ role: "user", content: "ping" }],
          stream: false,
          options: {
            temperature: 0.1,
          },
        };

        const response = await this.fetchFn(this.config.chatEndpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(payload),
          signal: combinedSignal,
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => "");
          throw new Error(
            `Ollama chat warm-up returned HTTP ${response.status} ${response.statusText}${
              errorText ? `: ${errorText}` : ""
            }`
          );
        }

        const bodyText = await response.text();
        const data = JSON.parse(bodyText) as { message?: { content?: unknown } };

        if (
          !data ||
          typeof data.message?.content !== "string" ||
          data.message.content.trim().length === 0
        ) {
          throw new Error("Warm-up response missing non-empty message.content");
        }

        if (this.isStopped) {
          return false;
        }

        this.hasWarmUpSucceeded = true;
        this.warmUpFailed = false;
        this.state.isReady = true;
        this.state.statusLabel = "Local AI Ready";
        this.state.detail = `Model '${this.config.model}' warmed up and operational`;
        this.state.consecutiveFailures = 0;
        return true;
      } catch (err: unknown) {
        if (this.isStopped) {
          return false;
        }
        const message = err instanceof Error ? err.message : String(err);
        this.hasWarmUpSucceeded = false;
        this.warmUpFailed = true;
        this.state.isReady = false;
        this.state.statusLabel = "Local AI Unavailable";
        this.state.detail = `Warm-up failed: ${message}. Restart backend to retry.`;
        return false;
      } finally {
        if (this.activeAbortController === abortCtrl) {
          this.activeAbortController = null;
        }
        this.inFlightWarmUp = null;
      }
    })();

    this.inFlightWarmUp = warmUpPromise;
    return warmUpPromise;
  }

  async start(): Promise<void> {
    if (this.isStopped || this.hasStarted) {
      return;
    }

    if (this.inFlightStart) {
      return this.inFlightStart;
    }

    const startPromise = (async (): Promise<void> => {
      try {
        this.hasStarted = true;
        const isAvailable = await this.checkAvailability();

        if (this.isStopped) {
          return;
        }

        if (isAvailable && !this.hasWarmUpSucceeded && !this.warmUpFailed) {
          await this.performWarmUp();
        }

        if (this.isStopped) {
          return;
        }

        this.scheduleNextCheck();
      } finally {
        this.inFlightStart = null;
      }
    })();

    this.inFlightStart = startPromise;
    return startPromise;
  }

  private scheduleNextCheck(): void {
    if (this.isStopped) {
      return;
    }

    this.clearTimer();

    this.activeTimer = this.scheduler.setTimeout(() => {
      void this.onPeriodicTick();
    }, this.checkIntervalMs);
  }

  private async onPeriodicTick(): Promise<void> {
    if (this.isStopped) {
      return;
    }

    const available = await this.checkAvailability();

    if (this.isStopped) {
      return;
    }

    if (available && !this.hasWarmUpSucceeded && !this.warmUpFailed) {
      await this.performWarmUp();
    }

    if (this.isStopped) {
      return;
    }

    this.scheduleNextCheck();
  }

  stop(): void {
    this.isStopped = true;
    this.hasStarted = false;
    this.inFlightStart = null;
    this.clearTimer();

    if (this.activeAbortController) {
      this.activeAbortController.abort();
      this.activeAbortController = null;
    }

    this.state = {
      isReady: false,
      statusLabel: "Local AI Unavailable",
      detail: "Readiness service stopped",
      model: this.config.model,
      consecutiveFailures: this.state.consecutiveFailures,
    };
  }

  private clearTimer(): void {
    if (this.activeTimer !== null) {
      this.scheduler.clearTimeout(this.activeTimer);
      this.activeTimer = null;
    }
  }
}
