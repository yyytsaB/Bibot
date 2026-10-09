import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { ReactFlow, Handle, Position, Controls } from '@xyflow/react'
import type { Node, NodeProps, ReactFlowInstance } from '@xyflow/react'
import { createMapPresentation } from '../../state/map-presentation'
import type { LearningConceptData } from '../../state/map-presentation'
import type { PracticeSession } from '../../state/practice-session'
import { MobileShell } from '../layout/MobileShell'
import { Icon } from '../layout/Icon'
import '@xyflow/react/dist/style.css'
import '../../styles/live-concept-map.css'

type InteractiveConceptNode = Node<LearningConceptData & { onSelect: (id: string) => void }, 'learningConcept'>
function ConceptNode({ id, data }: NodeProps<InteractiveConceptNode>) {
  return <div className={`live-concept-node live-concept-node--${data.color}`}>
    <Handle type="target" position={Position.Top} isConnectable={false} />
    <button type="button" className="nodrag nopan" onClick={() => data.onSelect(id)} aria-label={`${data.label}: ${data.status}. Show definition`}>
      <strong>{data.label}</strong><span>{data.status}</span>
    </button>
    <Handle type="source" position={Position.Bottom} isConnectable={false} />
  </div>
}
const nodeTypes = { learningConcept: ConceptNode }
const legend = [
  ['gray', 'Not Yet Practiced'], ['red', 'Needs Review'],
  ['amber', 'Improving'], ['green', 'Understanding Demonstrated'],
] as const

export function LiveConceptMap({ session, onNavigate }: { session: PracticeSession; onNavigate: (screen: number) => void }) {
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const [flow, setFlow] = useState<ReactFlowInstance<InteractiveConceptNode> | null>(null)
  useEffect(() => {
    if (!flow || !canvasRef.current) return
    const observer = new ResizeObserver(() => { void flow.fitView({ padding: .12 }) })
    observer.observe(canvasRef.current)
    return () => observer.disconnect()
  }, [flow])
  const presentation = createMapPresentation(session.map.getSnapshot())
  const nodes: InteractiveConceptNode[] = presentation.nodes.map(node => ({
    ...node, data: { ...node.data, onSelect: setSelectedId },
  }))
  const selected = presentation.nodes.find(node => node.id === selectedId)
  return <MobileShell active="map" onNavigate={tab => onNavigate(tab === 'home' ? 2 : tab === 'practice' ? 9 : 17)}>
    <section className="live-concept-map">
      <header className="page-header"><button className="icon-button" type="button" aria-label="Back to Home" onClick={() => onNavigate(2)}><Icon name="back" /></button><span>Critical Thinking</span></header>
      <h1>My Concept Map</h1>
      <p className="live-map-intro">{presentation.hasEvidence ? 'Your learning evidence, one answer at a time.' : 'Answer a prepared question to start building your map.'}</p>
      {snapshot.storageNotice && <p role="status">{snapshot.storageNotice}</p>}
      <div ref={canvasRef} className="live-map-canvas" aria-label="Critical Thinking concept map">
        <ReactFlow<InteractiveConceptNode> nodes={nodes} edges={presentation.edges} nodeTypes={nodeTypes}
          onInit={setFlow} fitView fitViewOptions={{ padding: .12 }} minZoom={.4} maxZoom={1.5}
          nodesDraggable={false} nodesConnectable={false} nodesFocusable={false} edgesFocusable={false}
          elementsSelectable={false} deleteKeyCode={null} zoomOnScroll={false} panOnDrag={false}
          onNodeClick={(_, node) => setSelectedId(node.id)}>
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
      <p className="live-map-hint">Select a concept to see its verified definition.</p>
      <ul className="live-map-legend" aria-label="Learning status colors">{legend.map(([color, label]) => <li key={color}><span className={`live-map-dot live-map-dot--${color}`} aria-hidden="true" />{label}</li>)}</ul>
      {selected && <section className="live-map-detail" aria-labelledby="live-map-selected-title">
        <button type="button" className="icon-button live-map-close" aria-label="Close concept details" onClick={() => setSelectedId(null)}>×</button>
        <h2 id="live-map-selected-title">{selected.data.label}</h2>
        <p className={`live-map-status live-map-status--${selected.data.color}`}>{selected.data.status}</p>
        <p>{selected.data.definition}</p>
        <p className="live-map-evidence">Consecutive correct answers: {selected.data.consecutiveCorrect}</p>
      </section>}
      {presentation.confusedPairs.length > 0 && <section className="live-map-confusions" aria-labelledby="live-map-confusions-title">
        <h2 id="live-map-confusions-title">Recorded confusions</h2>
        <p>Highlighted connections mark pairs with previous incorrect answers.</p>
        <ul>{presentation.confusedPairs.map(pair => <li key={`${pair.concept_a}-${pair.concept_b}`}><strong>{pair.label}</strong><span>{pair.count} incorrect {pair.count === 1 ? 'answer' : 'answers'}</span></li>)}</ul>
      </section>}
      <button type="button" className="primary-button dark" onClick={() => onNavigate(10)}>Continue Practice <Icon name="arrow" /></button>
    </section>
  </MobileShell>
}
