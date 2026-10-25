import { mkdir, readFile, writeFile, rename, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
export class LayoutStore {
  data = {version:1,nodes:{},branches:{}}; queue = Promise.resolve();
  constructor(directory) {this.directory = directory;this.file = join(directory,'layout.json');}
  async load() {
    try {this.data = JSON.parse(await readFile(this.file,'utf8'));}
    catch(error) { if(error.code !== 'ENOENT') throw new Error('地图布局文件损坏，请先备份并修复 layout.json。'); }
    return this.data;
  }
  update(patch) {
    this.queue = this.queue.catch(()=>{}).then(async()=>{
      await mkdir(this.directory,{recursive:true});
      const lock=this.file+'.lock';let acquired=false;
      for(let n=0;n<100;n++){
        try{await mkdir(lock);acquired=true;break;}catch(e){if(e.code!=='EEXIST')throw e;
          if(Date.now()-(await stat(lock).catch(()=>({mtimeMs:Date.now()}))).mtimeMs>30000)await rm(lock,{recursive:true,force:true});
          await new Promise(r=>setTimeout(r,30));}
      }
      if(!acquired)throw new Error('布局正在保存，请稍后重试');
      try{
        await this.load();
        const next={...this.data,nodes:{...this.data.nodes,...patch.nodes},branches:{...this.data.branches,...patch.branches},view:{...this.data.view,...patch.view}};
        await writeFile(this.file+'.tmp',JSON.stringify(next,null,2));
        await rename(this.file+'.tmp',this.file);this.data=next;return next;
      }finally{await rm(lock,{recursive:true,force:true});}
    }); return this.queue;
  }
}
