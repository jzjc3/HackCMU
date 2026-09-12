'use client';
export default function ErrorPage({reset}:{error:Error;reset:()=>void}) {
  return <main style={{minHeight:'100vh',display:'grid',placeItems:'center',background:'#fff',fontFamily:'var(--font-body)'}}><div style={{maxWidth:420,padding:32}}><h1 style={{fontWeight:400}}>Couldn't open your world.</h1><p>Your saved memories have not been changed.</p><button onClick={reset} style={{border:0,borderRadius:32,background:'#17171c',color:'#fff',padding:'12px 24px',cursor:'pointer'}}>Try again</button></div></main>;
}
