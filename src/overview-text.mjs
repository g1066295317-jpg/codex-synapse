// Lightweight display excerpt. Raw TeX stays in the full reader/normal preview;
// a zoomed-out map keeps nearby prose without invoking Markdown or KaTeX.
export const overviewText = (source = '', limit = 180) => {
  const text = source.slice(0, 3000)
    .replace(/```[\s\S]*?(?:```|$)/g, '〔代码〕')
    .replace(/\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|\$\$[\s\S]*?\$\$|\$[^$\n]+\$/g, '〔公式〕')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '〔图片〕')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*#_>`~]/g, '').replace(/\s+/g, ' ').trim();
  return text.length > limit ? text.slice(0, limit) + '…' : text;
};
