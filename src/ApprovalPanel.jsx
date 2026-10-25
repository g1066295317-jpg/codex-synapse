import React, {useState} from 'react';
import {ShieldCheck, ArrowUpRight} from 'lucide-react';
import {approvalChoices, approvalAnswers} from './native-state.mjs';

function ApprovalCard({approval, disabled, busy, respond, native}) {
  const [values, setValues] = useState({});
  const [other, setOther] = useState({});
  const questions = approval.questions || [];
  const ready = questions.every(question => (values[question.id] || '').trim());
  return <section className="approval-card" aria-label="待处理审批">
    <div className="approval-title"><ShieldCheck size={16}/><strong>{approval.title || (questions.length ? 'Codex 需要你的回答' : '需要你的批准')}</strong></div>
    {approval.reason && <p>{approval.reason}</p>}
    {approval.command && <pre>{approval.command}</pre>}
    {approval.cwd && <small className="approval-cwd">工作目录：{approval.cwd}</small>}
    {(approval.additionalPermissions || approval.changes || approval.commandActions || approval.grantRoot) && <details><summary>查看请求详情</summary><pre>{JSON.stringify({additionalPermissions: approval.additionalPermissions, changes: approval.changes, commandActions: approval.commandActions, grantRoot: approval.grantRoot}, null, 2)}</pre></details>}
    {questions.map(question => <fieldset key={question.id}><legend>{question.header || question.question}</legend>{question.header && <p>{question.question}</p>}
      {question.options?.map(option => <label className="approval-option" key={option.label}><input type="radio" name={approval.id + question.id} checked={!other[question.id] && values[question.id] === option.label} onChange={() => {setOther(previous => ({...previous, [question.id]: false})); setValues(previous => ({...previous, [question.id]: option.label}));}}/><span>{option.label}{option.description && <small>{option.description}</small>}</span></label>)}
      {question.options?.length && question.isOther && <label className="approval-option"><input type="radio" name={approval.id + question.id} checked={!!other[question.id]} onChange={() => {setOther(previous => ({...previous, [question.id]: true})); setValues(previous => ({...previous, [question.id]: ''}));}}/><span>其他回答</span></label>}
      {(!question.options?.length || other[question.id]) && <input className="approval-input" type={question.isSecret ? 'password' : 'text'} aria-label={question.question} value={values[question.id] || ''} onChange={event => setValues(previous => ({...previous, [question.id]: event.target.value}))}/>}
    </fieldset>)}
    <div className="approval-actions">{questions.length ? <button className="primary-button" disabled={disabled || busy || !ready} onClick={() => respond(approval, {answers: approvalAnswers(questions, values)})}>提交回答</button> : approvalChoices(approval).map(choice => <button key={choice.key} className={choice.negative ? '' : 'primary-button'} disabled={disabled || busy} onClick={() => respond(approval, {decision: choice.value})}>{choice.label}</button>)}<button className="text-button" onClick={() => native(approval.threadId)}>在原生聊天处理<ArrowUpRight size={13}/></button></div>
  </section>;
}

export default function ApprovalPanel({approvals, ...props}) {
  return approvals?.length ? <div className="approvals" aria-live="polite">{approvals.map(approval => <ApprovalCard key={approval.id} approval={approval} {...props}/>)}</div> : null;
}
