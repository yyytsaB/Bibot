import type { HomeConceptStatus, HomeMapPreviewData } from './home-presentation'
import { Icon } from '../layout/Icon'
import '../../styles/home-refinement.css'
const colors: Record<HomeConceptStatus, string> = { 'Not Yet Practiced': 'gray', 'Needs Review': 'red', Improving: 'amber', 'Understanding Demonstrated': 'green' }
export function HomeMapPreview({ data, onOpenMap }: { data?: HomeMapPreviewData; onOpenMap?: () => void }) {
  const nodes = data?.nodes
  const valid = nodes && nodes.length > 0 && new Set(nodes.map(node => node.id)).size === nodes.length && nodes.every(node => node.id && node.label && Object.hasOwn(colors, node.status))
  const empty = data?.hasEvidence === false || nodes?.length === 0
  return <section className="f14-map-preview" aria-label="Concept map preview"><div className="f14-map-heading"><Icon name="map" /><h2>Your concept map</h2></div>{empty && <p>No learning evidence yet. Start reviewed practice to build your map.</p>}{valid ? <ul>{nodes.map(node => <li key={node.id}><span className={`f14-map-dot ${colors[node.status]}`} aria-hidden="true" /><span><strong>{node.label}</strong><small>{node.status}</small></span></li>)}</ul> : !empty && <p>Map preview unavailable.</p>}{onOpenMap && <button type="button" className="f14-map-open" onClick={onOpenMap}>Open Map <Icon name="arrow" /></button>}</section>
}
