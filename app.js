const TG_ID="6106285473";
const API="https://api.kuronaiapp.com";
const fileEl=document.getElementById("file"),drop=document.getElementById("drop"),start=document.getElementById("start");
const fileName=document.getElementById("fileName"),fill=document.getElementById("fill"),statusEl=document.getElementById("status"),logEl=document.getElementById("log");
const hq=document.getElementById("hq"),enc=document.getElementById("enc"),download=document.getElementById("download"),downloadLink=document.getElementById("downloadLink"),tiktokTools=document.getElementById("tiktokTools");
let selected=null,running=false;
const say=(s,cls="")=>{statusEl.textContent=s;statusEl.className="status "+cls;logEl.textContent+=s+"\n";logEl.scrollTop=logEl.scrollHeight};
const progress=n=>fill.style.width=Math.max(0,Math.min(100,n))+"%";
const stage=(el,state,text)=>{el.className="s "+state;el.innerHTML=`<b>${el.querySelector("b")?.textContent||""}</b>${text}`};

fileEl.addEventListener("change",()=>{selected=fileEl.files[0]||null;if(selected){fileName.textContent=`${selected.name} · ${(selected.size/1048576).toFixed(1)} MB`;start.disabled=false}else{fileName.textContent="Belum ada file";start.disabled=true}});

function parseEvents(xhr,onEvent,final=false){
  let text=xhr.responseText||"";let lines=text.split(/\r?\n/);if(!final)lines.pop();
  for(const line of lines){if(!line.trim())continue;try{onEvent(JSON.parse(line))}catch{throw new Error("Respons server tidak valid.")}}
}

function upload(file,endpoint,encode,startPct,endPct,label){return new Promise((resolve,reject)=>{
  const x=new XMLHttpRequest();let cursor=0,buffer="",done=null,serverProgress=false,finished=false;
  const fail=(msg)=>{if(finished)return;finished=true;try{x.abort()}catch{}reject(new Error(msg))};
  const handle=(final)=>{if(finished)return;const chunk=x.responseText.slice(cursor);cursor=x.responseText.length;buffer+=chunk;let lines=buffer.split(/\r?\n/);if(!final)buffer=lines.pop()||"";else buffer="";
    for(const line of lines){if(!line.trim())continue;let e;try{e=JSON.parse(line)}catch{fail("Respons server tidak valid.");return}
      if(e.type==="error"){fail(e.code||"Server processing error");return}
      if(e.type==="progress"){serverProgress=true;const p=Number(e.percent);if(Number.isFinite(p))progress(startPct+(p/100)*(endPct-startPct));say(`${label}: ${e.stage||e.status||"processing"}${Number.isFinite(p)?" · "+Math.round(p)+"%":""}`)}
      if(e.type==="complete"&&e.file_id)done=e.file_id;
    }
  };
  x.open("POST",API+endpoint,true);x.timeout=0;
  x.upload.onprogress=e=>{if(e.lengthComputable&&!serverProgress){const p=e.loaded/e.total;progress(startPct+p*Math.min(12,endPct-startPct));say(`${label}: upload ${Math.round(p*100)}%`)}};
  x.onprogress=()=>{if((x.getResponseHeader("Content-Type")||"").includes("application/x-ndjson"))try{handle(false)}catch(e){fail(e.message)}};
  x.onload=()=>{if(finished)return;if(x.status<200||x.status>=300){let detail="";try{detail=JSON.parse(x.responseText).detail||""}catch{};fail(detail||`Server menolak request (HTTP ${x.status})`);return}
    try{if((x.getResponseHeader("Content-Type")||"").includes("application/x-ndjson"))handle(true);else{const j=JSON.parse(x.responseText);done=j.file_id}}catch(e){fail(e.message);return}
    if(!done){fail("Server tidak mengembalikan file_id.");return}finished=true;resolve(done);
  };
  x.onerror=()=>fail("Koneksi ke server gagal.");x.onabort=()=>{};
  const fd=new FormData();fd.append("file",file,"video.mp4");fd.append("tg_id",TG_ID);fd.append("progress","true");if(endpoint==="/upload/")fd.append("encode_video",String(encode));x.send(fd);
})}

async function downloadFile(fileId,startPct,endPct,label="DOWNLOAD RESULT"){
  const url=`${API}/download/${encodeURIComponent(fileId)}`;
  const MAX_RETRIES=2;
  const PARTS=4;

  // One byte-range probe is used only to learn the exact server-side file size.
  // The actual result is then fetched in exactly four parallel 25/25/25/25 byte ranges.
  let total;
  try{
    const x=new XMLHttpRequest();
    total=await new Promise((resolve,reject)=>{
      let done=false;
      const fail=m=>{if(done)return;done=true;try{x.abort()}catch{}reject(new Error(m));};
      x.open("GET",url,true);x.responseType="arraybuffer";x.timeout=10*60*1000;
      x.setRequestHeader("Range","bytes=0-0");
      x.onload=()=>{
        if(done)return;
        const cr=x.getResponseHeader("Content-Range")||"";
        const m=cr.match(/^bytes\s+(\d+)-(\d+)\/(\d+)$/i);
        if(x.status!==206||!m||Number(m[1])!==0||Number(m[2])!==0){fail("SERVER_DOES_NOT_SUPPORT_RANGE");return;}
        done=true;resolve(Number(m[3]));
      };
      x.onerror=()=>fail("NETWORK_ERROR");
      x.ontimeout=()=>fail("RANGE_TIMEOUT");
      x.onabort=()=>{if(!done)reject(new Error("RANGE_ABORTED"));};
      x.send();
    });
  }catch(e){throw new Error("Server tidak mendukung Range download.");}

  if(!Number.isFinite(total)||total<=0)throw new Error("Ukuran hasil download tidak valid.");
  say(`${label}: mengambil ${(total/1048576).toFixed(1)} MB dengan 4 jalur 25/25/25/25 paralel…`);

  const ranges=[];
  for(let i=0;i<PARTS;i++){
    const start=Math.floor(i*total/PARTS);
    const end=Math.floor((i+1)*total/PARTS)-1;
    ranges.push([start,end]);
  }
  const buffers=new Array(PARTS);
  const loaded=new Array(PARTS).fill(0);

  async function rangeDownload(start,end,index){
    let lastErr=null;
    for(let attempt=0;attempt<=MAX_RETRIES;attempt++){
      try{
        const x=new XMLHttpRequest();
        const result=await new Promise((resolve,reject)=>{
          let done=false;
          const fail=m=>{if(done)return;done=true;try{x.abort()}catch{};reject(new Error(m));};
          x.open("GET",url,true);x.responseType="arraybuffer";x.timeout=10*60*1000;
          x.setRequestHeader("Range",`bytes=${start}-${end}`);
          x.onprogress=e=>{loaded[index]=e.loaded;report();};
          x.onload=()=>{
            if(done)return;
            if(x.status!==206){fail(`RANGE_${x.status}`);return;}
            const buf=x.response;
            const expected=end-start+1;
            const cr=x.getResponseHeader("Content-Range")||"";
            const m=cr.match(/^bytes\s+(\d+)-(\d+)\/(\d+)$/i);
            if(!m||Number(m[1])!==start||Number(m[2])!==end||Number(m[3])!==total||buf.byteLength!==expected){fail("RANGE_DATA_MISMATCH");return;}
            done=true;resolve(buf);
          };
          x.onerror=()=>fail("NETWORK_ERROR");
          x.ontimeout=()=>fail("RANGE_TIMEOUT");
          x.onabort=()=>{if(!done)reject(new Error("RANGE_ABORTED"));};
          x.send();
        });
        loaded[index]=result.byteLength;report();
        return result;
      }catch(e){
        lastErr=e;
        if(attempt<MAX_RETRIES){
          say(`${label}: Jalur ${index+1}/4 retry ${attempt+1}/${MAX_RETRIES}…`);
          await new Promise(r=>setTimeout(r,500*(attempt+1)));
        }
      }
    }
    throw lastErr||new Error(`Jalur ${index+1} gagal.`);
  }

  function report(){
    const sum=loaded.reduce((a,b)=>a+b,0);
    progress(startPct+(sum/total)*(endPct-startPct));
    say(`${label}: ${(sum/1048576).toFixed(1)} MB / ${(total/1048576).toFixed(1)} MB · 4 jalur`);
  }

  const jobs=ranges.map((r,i)=>rangeDownload(r[0],r[1],i).then(buf=>{buffers[i]=buf;}));
  await Promise.all(jobs);

  // Binary concatenation only: no decode, encode, remux, or media processing.
  const blob=new Blob(buffers,{type:"video/mp4"});
  if(blob.size!==total)throw new Error(`Ukuran download tidak cocok (${blob.size} / ${total} byte).`);
  progress(endPct);
  say(`${label}: selesai (${(blob.size/1048576).toFixed(1)} MB) · 4 jalur 25/25/25/25.`);
  return blob;
}

async function cleanup(id){fetch(`${API}/cleanup/${encodeURIComponent(id)}`,{method:"DELETE"}).catch(()=>{})}

start.addEventListener("click",async()=>{if(!selected||running)return;running=true;start.disabled=true;download.style.display="none";if(tiktokTools)tiktokTools.style.display="none";progress(0);logEl.textContent="";stage(hq,"active","Memulai…");stage(enc,"","Menunggu");
 try{
   say("READING VIDEO…");
   progress(2);
   await new Promise(r=>setTimeout(r,250));
   say("UPLOADING VIDEO…");
   const hqId=await upload(selected,"/uploaden/",false,5,42,"HQ METHOD");
   stage(hq,"done","Selesai");progress(42);say("HQ METHOD selesai. Mengambil hasil…","ok");
   const hqBlob=await downloadFile(hqId,42,52,"HQ RESULT");await cleanup(hqId);say("HQ RESULT tersimpan sementara.","ok");
   let finalBlob=hqBlob;
   {
     const hqFile=new File([hqBlob],"wanzyy hq.mp4",{type:"video/mp4"});
     stage(enc,"active","Menunggu upload…");say("UPLOADING HQ RESULT KE ENCODER…");
     const encId=await upload(hqFile,"/upload/",true,52,90,"ENCODE VIDEO");
     stage(enc,"done","Selesai");progress(90);say("ENCODE selesai. Mengunduh hasil akhir…","ok");
     finalBlob=await downloadFile(encId,90,100,"FINAL RESULT");await cleanup(encId);
   }
   const url=URL.createObjectURL(finalBlob);downloadLink.href=url;download.style.display="block";if(tiktokTools)tiktokTools.style.display="block";
   try{const a=document.createElement("a");a.href=url;a.download="nto.presett output final.mp4";a.click()}catch{}
   progress(100);say("DONE · nto.presett output final.mp4 siap.","ok");
 }catch(e){say(e.message||"Processing failed.","err");stage(hq,hq.classList.contains("done")?"done":"",hq.classList.contains("done")?"Selesai":"Gagal");if(!enc.classList.contains("done"))stage(enc,"","Tidak selesai");
 }finally{running=false;start.disabled=!selected;}
});
