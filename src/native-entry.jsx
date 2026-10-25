import React from 'react';
import {createRoot} from 'react-dom/client';
import {ReactFlowProvider} from '@xyflow/react';
import NativeWorkspace from './NativeWorkspace.jsx';
import './reactflow-scoped.css';
import './native.css';
import './katex-scoped.css';
import {katexFontFaces} from './katex-fonts.mjs';

const roots = new WeakMap();
const fontSheets = new WeakMap();

export function mount(container, host) {
  if (!container || typeof container.appendChild !== 'function') throw new Error('需要有效的画布容器');
  if (!host || typeof host.call !== 'function' || typeof host.nativeChat !== 'function') throw new Error('缺少 Codex 原生桥接接口');
  if (roots.has(container)) return roots.get(container).handle;
  const doc=container.ownerDocument;
  let fonts=fontSheets.get(doc);
  if(!fonts){const style=doc.createElement('style');style.dataset.synapseMathFonts='true';style.textContent=katexFontFaces;doc.head.append(style);fonts={style,users:0};fontSheets.set(doc,fonts);}
  fonts.users++;
  const element = container.ownerDocument.createElement('div');
  element.className = 'synapse-native-root';
  element.lang = 'zh-CN';
  container.appendChild(element);
  const root = createRoot(element);
  const handle = {unmount: () => unmount(container)};
  roots.set(container, {root, element, handle,doc});
  root.render(<ReactFlowProvider><NativeWorkspace host={host}/></ReactFlowProvider>);
  return handle;
}

export function unmount(container) {
  const mounted = roots.get(container);
  if (!mounted) return false;
  mounted.root.unmount();
  mounted.element.remove();
  const fonts=fontSheets.get(mounted.doc);
  if(fonts&&--fonts.users===0){fonts.style.remove();fontSheets.delete(mounted.doc);}
  roots.delete(container);
  return true;
}
