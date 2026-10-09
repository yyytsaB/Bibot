import type { Edge, Node } from '@xyflow/react';
import type { LearningMapSnapshot, LearningMapNode } from './learning-map.ts';

export type LearningConceptData = Pick<LearningMapNode, 'label' | 'definition' | 'status' | 'color'> & {
  consecutiveCorrect: number;
};
export type LearningConceptNode = Node<LearningConceptData, 'learningConcept'>;

/** Presentation only: F10 remains authoritative for topology, evidence and status. */
export function createMapPresentation(snapshot: LearningMapSnapshot) {
  const labels = new Map(snapshot.nodes.map(node => [node.id, node.label]));
  const nodes: LearningConceptNode[] = snapshot.nodes.map(node => ({
    id: node.id,
    type: 'learningConcept',
    // Compress the predefined horizontal spacing for the existing phone-width shell.
    position: { x: node.position.x * .5, y: node.position.y },
    style: { width: 158 },
    draggable: false,
    connectable: false,
    deletable: false,
    ariaLabel: `${node.label}: ${node.status}`,
    data: {
      label: node.label, definition: node.definition, status: node.status, color: node.color,
      consecutiveCorrect: snapshot.concepts.find(concept => concept.concept_id === node.id)?.consecutive_correct ?? 0,
    },
  }));
  const edges: Edge[] = snapshot.edges.map(edge => ({
    id: edge.id, source: edge.source, target: edge.target, type: 'straight',
    deletable: false,
    className: edge.isConfused ? 'live-map-edge-confused' : 'live-map-edge',
    style: { stroke: edge.isConfused ? '#c22b50' : '#aaa0c6', strokeWidth: edge.isConfused ? 3 : 1.5 },
    ariaLabel: `${labels.get(edge.source)} and ${labels.get(edge.target)}${edge.isConfused ? `: ${edge.count} recorded incorrect ${edge.count === 1 ? 'answer' : 'answers'}` : ''}`,
  }));
  const confusedPairs = snapshot.confused_pairs.map(pair => ({
    ...pair, label: `${labels.get(pair.concept_a)} / ${labels.get(pair.concept_b)}`,
  }));
  return { nodes, edges, confusedPairs, hasEvidence: snapshot.concepts.some(concept => concept.last_updated !== null) };
}
