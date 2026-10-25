import {fromMarkdown} from 'mdast-util-from-markdown';

const escaped=(source,index)=>{let n=0;while(index>0&&source[--index]==='\\')n++;return n%2===1;};
function protectedRanges(source){
  const ranges=[];
  const visit=node=>{
    if(['code','inlineCode','html','definition'].includes(node.type)&&node.position){ranges.push({start:node.position.start.offset,end:node.position.end.offset});return;}
    if(node.children)for(const child of node.children)visit(child);
  };
  visit(fromMarkdown(source));return ranges.sort((a,b)=>a.start-b.start);
}
// Convert before CommonMark consumes the backslash escapes. Code samples remain literal.
function scan(source){
  const protectedSpans=protectedRanges(source),mathSpans=[];let output='',i=0,p=0;
  const protectedAt=index=>protectedSpans.find(span=>span.start<=index&&span.end>index);
  while(i<source.length){
    while(protectedSpans[p]?.end<=i)p++;
    const code=protectedSpans[p];
    if(code&&code.start<=i){output+=source.slice(i,code.end);i=code.end;continue;}
    const slashMath=source[i]==='\\'&&['(','['].includes(source[i+1])&&!escaped(source,i);
    const dollars=source[i]==='$'&&!escaped(source,i);
    if(slashMath||dollars){
      const display=slashMath?source[i+1]==='[':source[i+1]==='$';
      const open=slashMath?source.slice(i,i+2):display?'$$':'$';
      const close=slashMath?(display?'\\]':'\\)'):open;
      let end=source.indexOf(close,i+open.length);
      while(end!==-1&&(escaped(source,end)||protectedAt(end)))end=source.indexOf(close,end+close.length);
      if(end!==-1){
        const content=source.slice(i+open.length,end);
        if(content.trim()&&(display||!content.includes('\n\n'))){
          const finish=end+close.length;mathSpans.push({start:i,end:finish});
          output+=slashMath?(display?'\n\n$$\n'+content.trim()+'\n$$\n\n':'$'+content.trim()+'$'):source.slice(i,finish);
          i=finish;continue;
        }
      }
    }
    output+=source[i++];
  }
  return {text:output,mathSpans};
}
export function normalizeMathDelimiters(source=''){return scan(source).text;}
export function mathPreview(source='',limit=850){
  if(source.length<=limit)return source;
  const {mathSpans}=scan(source);
  let end=limit;
  const math=mathSpans.find(span=>span.start<end&&span.end>end);
  if(math)end=math.end<=limit*3?math.end:math.start;
  if(!end)return '（完整公式请查看详情）';
  return source.slice(0,end)+'\n\n…';
}
