import {useEffect,useRef} from 'react'
import {PDFDocument} from 'pdf-lib'
import {getDocument} from 'pdfjs-dist'
import {exportPdf} from '@/lib/pdf-engine'
import type {Overlay} from '@/lib/overlay-types'
/** Render text with the export engine and the same PDF.js renderer as the final PDF. */
export function TextOverlayPreview({overlay,width,height}:{overlay:Overlay;width:number;height:number}){
 const ref=useRef<HTMLCanvasElement>(null)
 useEffect(()=>{let cancelled=false;let loading:ReturnType<typeof getDocument>|undefined;let renderTask:ReturnType<Awaited<ReturnType<Awaited<ReturnType<typeof getDocument>['promise']>['getPage']>>['render']>|undefined;
 async function draw(){try{const blank=await PDFDocument.create();blank.addPage([width,height]);const bytes=await exportPdf(await blank.save(),[0],[{...overlay,pageIndex:0,x:0,y:0,width:1,height:1}]);if(cancelled)return;loading=getDocument({data:bytes});const doc=await loading.promise;const page=await doc.getPage(1);if(cancelled||!ref.current)return;const canvas=ref.current;const scale=Math.max(1,window.devicePixelRatio||1);const viewport=page.getViewport({scale});canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);renderTask=page.render({canvas,canvasContext:canvas.getContext('2d')!,viewport,background:'rgba(0,0,0,0)'});await renderTask.promise}catch{/* Export surfaces unsupported-character errors; preview remains non-destructive. */}}
 void draw();return()=>{cancelled=true;renderTask?.cancel();void loading?.destroy()}
 },[overlay,width,height]);return <canvas ref={ref} aria-label={overlay.text||'Text annotation'} style={{width:'100%',height:'100%',display:'block',pointerEvents:'none'}}/>
}
