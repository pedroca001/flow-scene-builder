// Read only the current ready scene through the existing native protocol.
// Deliver a File to Flow's normal drop handler, avoiding browser file navigation.
export async function frameDataUrl(host,folder){
  let offset=0,size=null;const parts=[];
  while(size===null||offset<size){
    const chunk=await host.ask('frame',{folder,offset});
    if(!Number.isInteger(chunk.size)||chunk.size<8||chunk.size>64*1024*1024||
       chunk.offset!==offset||(size!==null&&chunk.size!==size))throw Error('Metadados do frame inconsistentes.');
    size=chunk.size;const bytes=atob(chunk.data);
    if(!bytes.length||offset+bytes.length>size)throw Error('Transferencia do frame incompleta.');
    parts.push(bytes);offset+=bytes.length;
  }
  const bytes=parts.join('');
  if(bytes.slice(0,8)!=='\x89PNG\r\n\x1a\n')throw Error('Frame transferido nao e PNG.');
  return 'data:image/png;base64,'+btoa(bytes);
}
