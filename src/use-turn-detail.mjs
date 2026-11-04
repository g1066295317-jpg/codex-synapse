import {useEffect, useRef, useState} from 'react';
import {TurnDetailCache, loadTurnDetail} from './turn-detail-cache.mjs';

export const useTurnDetail = ({call, record, threadId, updatedAt, enabled}) => {
  const cache = useRef(null);
  if (!cache.current) cache.current = new TurnDetailCache();
  const [state, setState] = useState({});
  const [attempt, setAttempt] = useState(0);
  const turnId = record?.turn.id;
  const key = record ? record.id + ':' + JSON.stringify(record.turn) + ':' + (updatedAt || '') : '';
  useEffect(() => {
    if (!enabled || !turnId) {setState({}); return;}
    let cancelled = false;
    const cached = cache.current.get(key);
    if (cached) {setState({key, turn: cached}); return;}
    setState({key, loading: true});
    loadTurnDetail(call, threadId, turnId).then(turn => {
      if (cancelled) return;
      cache.current.set(key, turn); setState({key, turn});
    }, error => {if (!cancelled) setState({key, error: error.message});});
    return () => {cancelled = true;};
  }, [call, key, enabled, threadId, turnId, attempt]);
  useEffect(() => () => cache.current.clear(), []);
  return {...(enabled && state.key === key ? state : {}), loading: enabled && !!turnId && (state.key !== key || !!state.loading), retry: () => setAttempt(value => value + 1)};
};
