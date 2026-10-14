import test from 'node:test';
import assert from 'node:assert/strict';
import { isLocalPngPath, localFileName } from '../extension/core.js';

test('upload accepts absolute PNG paths on macOS and Windows',()=>{
  for(const path of ['/Users/pedro/Downloads/frame.png','C:\\Users\\Pedro\\frame.png','S:/receita/frame.png','\\\\server\\media\\frame.png']){
    assert.equal(isLocalPngPath(path),true,path);
    assert.equal(localFileName(path),'frame.png');
  }
});

test('upload rejects relative paths, URLs and control characters',()=>{
  for(const path of [null,{},'frame.png','C:frame.png','\\frame.png','https://example.com/frame.png','file:///C:/frame.png','C:/frame.jpg','C:/frame.png\n','C:/bad\0frame.png']){
    assert.equal(isLocalPngPath(path),false,String(path));
  }
});

test('asset name contains only the basename for both separators',()=>{
  assert.equal(localFileName('C:\\Users\\Pedro\\Meu lote\\fsb_original.png'),'fsb_original.png');
  assert.equal(localFileName('/Users/pedro/Meu lote/fsb_original.png'),'fsb_original.png');
});
