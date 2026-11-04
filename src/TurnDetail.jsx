import React from 'react';
import {LoaderCircle} from 'lucide-react';
import {TurnBody} from './TurnNode.jsx';

export default function TurnDetail({turn, loading, error, retry, onQuote}) {
  if (loading) return <p className="reader-loading" role="status"><LoaderCircle size={16} className="spin"/>正在读取完整问答…</p>;
  if (error) return <div className="reader-error" role="alert"><p>{error}</p><button onClick={retry}>重新读取详情</button></div>;
  if (!turn) return null;
  return <TurnBody turn={turn} onQuote={onQuote}/>;
}
