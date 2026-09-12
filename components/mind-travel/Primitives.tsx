'use client';
import React from 'react';
export function Button({variant='primary',size='md',children,style,...rest}:React.ButtonHTMLAttributes<HTMLButtonElement>&{variant?:'primary'|'inverse'|'outline'|'text';size?:'sm'|'md'}){
  const pad = size==='sm'?'8px 16px':'12px 24px';
  const base:React.CSSProperties={display:'inline-flex',alignItems:'center',whiteSpace:'nowrap',flexShrink:0,gap:8,font:'var(--text-button)',fontSize:size==='sm'?14:16,padding:pad,borderRadius:'var(--radius-pill)',border:'1px solid transparent',cursor:'pointer',textDecoration:'none',transition:'background var(--motion-fast) var(--ease-standard),color var(--motion-fast)'};
  const v={
    primary:{background:'var(--button-primary-bg)',color:'var(--button-primary-fg)'},
    inverse:{background:'#fff',color:'var(--color-near-black)'},
    outline:{background:'transparent',color:'var(--text-primary)',borderColor:'var(--color-near-black)',borderRadius:'var(--radius-xl)'},
    text:{background:'transparent',color:'var(--text-primary)',padding:0,borderRadius:0,textDecoration:'underline',textUnderlineOffset:3},
  }[variant];
  const dis = rest.disabled?{opacity:.4,cursor:'default'}:null;

  return <button type="button" style={{...base,...v,...dis,...style}} {...rest}>{children}</button>;
}

export function Chip({tone='coral',active=false,size='md',children,...rest}:React.ButtonHTMLAttributes<HTMLButtonElement>&{tone?:'coral'|'outline';active?:boolean;size?:'lg'|'md'|'sm'}){
  const coral = tone==='coral';
  const s:React.CSSProperties={display:'inline-flex',alignItems:'center',cursor:'pointer',font:'var(--text-body)',fontSize:size==='lg'?24:size==='md'?16:14,lineHeight:1,padding:size==='lg'?'14px 22px':size==='md'?'10px 16px':'6px 12px',borderRadius:coral?'var(--radius-sm)':'var(--radius-xl)',border:'1px solid '+(coral?(active?'var(--color-coral)':'var(--color-soft-coral)'):'var(--color-near-black)'),background:coral?(active?'var(--color-coral)':'#fff5f2'):(active?'var(--color-near-black)':'transparent'),color:coral?'var(--color-near-black)':(active?'#fff':'var(--text-primary)'),transition:'background var(--motion-fast)'};
  return <button type="button" style={s} {...rest}>{children}</button>;
}

export function MonoLabel({color='var(--text-muted)',children,style}:{color?:string;children?:React.ReactNode;style?:React.CSSProperties}){
  return <span style={{font:'var(--text-mono-label)',letterSpacing:'var(--tracking-mono-label)',textTransform:'uppercase',color,...style}}>{children}</span>;
}