import { useEffect, useRef } from 'react'
import { ReactFlow, ReactFlowProvider, Handle, Position, useNodesInitialized, useReactFlow } from '@xyflow/react'
import type { Node, NodeProps, Edge } from '@xyflow/react'
import type { FixtureMapSnapshot } from '../../../../shared/src/fixtures'
import '@xyflow/react/dist/style.css'

type MapNode = Node<{ label: string; tone: string; status?: string; root?: boolean }, 'concept'>
function ConceptNode({ data }: NodeProps<MapNode>) {
  return <div className={`map-design-node ${data.tone} ${data.root ? 'root' : ''}`} title={data.status}><Handle type="target" position={Position.Top} />{data.root ? <svg viewBox="0 0 40 40" fill="#8749ff" aria-hidden="true"><path d="M19 10C14 5 7 6 4 9v22c5-3 10-2 15 2ZM21 10c5-5 12-4 15-1v22c-5-3-10-2-15 2Z" /></svg> : <span className="map-design-node-status" aria-label={data.status}><svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">{data.tone === 'green' ? <path d="m5 12 5 5 9-11" /> : data.tone === 'amber' ? <g stroke="#e9a500" strokeWidth="3"><path d="M6 19v-6M12 19V7M18 19V3" /></g> : data.tone === 'gray' ? <circle cx="12" cy="12" r="6" /> : <path d="M12 5v9M12 19h0" />}</svg></span>}<span>{data.label}</span><Handle type="source" position={Position.Bottom} /></div>
}
const nodeTypes = { concept: ConceptNode }
const status = { red: 'Needs Review', green: 'Understanding Demonstrated', amber: 'Improving', gray: 'Not Yet Practiced' }
const examples: MapNode[] = [
  {id:'root',position:{x:95,y:10},data:{label:'Logical Reasoning',tone:'purple',root:true},style:{width:180}},
  {id:'induction',position:{x:0,y:125},data:{label:'Induction',tone:'red',status:status.red}},
  {id:'deduction',position:{x:126,y:125},data:{label:'Deduction',tone:'green',status:status.green}},
  {id:'abduction',position:{x:252,y:125},data:{label:'Abduction',tone:'amber',status:status.amber}},
  {id:'generalization',position:{x:0,y:220},data:{label:'Generalization from Observations',tone:'red',status:status.red},style:{width:125}},
  {id:'valid',position:{x:143,y:233},data:{label:'Valid Arguments',tone:'green',status:status.green}},
  {id:'best',position:{x:267,y:237},data:{label:'Inference to Best Explanation',tone:'amber',status:status.amber}},
  {id:'causal',position:{x:0,y:350},data:{label:'Causal Relationships',tone:'red',status:status.red},style:{width:140}},
].map(node=>({...node,type:'concept',style:{width:118,...node.style}}))
const links: Edge[] = [['root','induction','#ff77ae'],['root','deduction','#70dca8'],['root','abduction','#ffd450'],['induction','generalization','#ff77ae'],['deduction','valid','#70dca8'],['abduction','best','#ffd450'],['generalization','causal','#ff77ae']].map(([source,target,color])=>({id:source+'-'+target,source,target,type:'default',style:{stroke:color,strokeWidth:1.5}}))
function DiagramCanvas({ nodes, edges, onSelect }: { nodes: MapNode[]; edges: Edge[]; onSelect: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const initialized = useNodesInitialized()
  const { fitView } = useReactFlow()
  useEffect(() => { if (initialized) void fitView({ padding: .08 }) }, [initialized, fitView, nodes])
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const observer = new ResizeObserver(() => { void fitView({ padding: .08 }) })
    observer.observe(container)
    return () => observer.disconnect()
  }, [fitView])
  return <div ref={containerRef} style={{ width: '100%', height: '100%' }}><ReactFlow fitView fitViewOptions={{ padding: .08 }} nodes={nodes} edges={edges} nodeTypes={nodeTypes} minZoom={.2} maxZoom={1.5} nodesDraggable={false} nodesConnectable={false} zoomOnScroll={false} zoomOnPinch={false} panOnDrag={false} onNodeClick={onSelect} proOptions={{hideAttribution:true}} /></div>
}
export function MapDiagramPreview({ snapshot, onSelect }: { snapshot?: FixtureMapSnapshot; onSelect: () => void }) {
  const nodes: MapNode[] = snapshot ? snapshot.nodes.map((node,index)=>({id:node.id,type:'concept',position:{x:index*132,y:100},style:{width:120},data:{label:node.label,tone:node.color,status:node.status}})) : examples
  const edges: Edge[] = snapshot ? snapshot.edges.map(edge=>({id:edge.id,source:edge.source,target:edge.target,style:{stroke:edge.isConfused ? '#ff77ae' : '#b6aad5',strokeWidth:2},type:'default'})) : links
  return <div className="map-design-diagram" aria-label={snapshot ? 'F1a fixture concept map' : 'Illustrative concept map'}><ReactFlowProvider><DiagramCanvas nodes={nodes} edges={edges} onSelect={onSelect} /></ReactFlowProvider></div>
}
