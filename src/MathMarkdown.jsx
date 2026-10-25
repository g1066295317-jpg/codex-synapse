import React,{memo,useMemo} from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import {mathPreview,normalizeMathDelimiters} from './math-markdown.mjs';

const remarkPlugins=[remarkGfm,remarkMath];
const rehypePlugins=[[rehypeKatex,{trust:false,throwOnError:false,strict:'ignore',maxExpand:500,maxSize:10,output:'htmlAndMathml'}]];
export default memo(function MathMarkdown({source='',compact=false,className=''}){
  const content=useMemo(()=>normalizeMathDelimiters(compact?mathPreview(source):source),[source,compact]);
  return <div className={'math-markdown '+className}><Markdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins} skipHtml>{content}</Markdown></div>;
});
