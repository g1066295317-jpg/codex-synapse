const validId=id=>typeof id==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(id);
const pages=async(rpc,method,args={})=>{
 const data=[],seen=new Set();let cursor;
 do{const page=await rpc.call(method,{...args,...(cursor?{cursor}:{})});if(!Array.isArray(page?.data))throw new Error('无法确认画布会话占用状态，请稍后重试');data.push(...page.data);cursor=page.nextCursor;if(cursor&&seen.has(cursor))throw new Error('会话状态分页异常，未释放连接');if(cursor)seen.add(cursor);}while(cursor);
 return data;
};
// Unsubscribe can retain the idle session lock. Recycle only our own completely
// idle RPC process, never the desktop client, an active turn or a background task.
export const releaseForNative=async(rpc,workspace,id)=>{
 if(!validId(id))throw new Error('无效会话标识');
 if(rpc.connected===false)return{released:false};
 const loaded=await pages(rpc,'thread/loaded/list');
 if(loaded.some(value=>!validId(value)))throw new Error('会话占用返回格式异常，未释放连接');
 if(!loaded.includes(id))return{released:false};
 if(workspace.sending.size||workspace.listApprovals().length)throw new Error('画布仍在提交或等待审批，请先完成后再返回原生聊天');
 for(const threadId of loaded){
  const {thread}=await rpc.call('thread/read',{threadId,includeTurns:false});
  if(!['idle','notLoaded'].includes(thread?.status?.type))throw new Error('画布中仍有分支在生成或等待处理，请先完成后再返回原生聊天');
  const terminals=await pages(rpc,'thread/backgroundTerminals/list',{threadId});
  if(terminals.length)throw new Error('画布分支还有后台命令运行，请先处理后再返回原生聊天');
 }
 // Recheck after asynchronous reads so newly arrived approvals cannot be dropped.
 if(workspace.sending.size||workspace.listApprovals().length)throw new Error('画布出现待处理请求，暂未释放会话');
 for(const threadId of loaded){const result=await rpc.call('thread/unsubscribe',{threadId});if(!['unsubscribed','notSubscribed','notLoaded'].includes(result?.status))throw new Error('当前版本无法确认会话已取消订阅，未断开连接');}
 await rpc.disconnectForHandoff();workspace.live.clear();
 return{released:true,releasedThreads:loaded.length};
};
