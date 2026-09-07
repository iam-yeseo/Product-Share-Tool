// Local-only fixture server. Production HTML never references the fixture client.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),files=new Map();
http.createServer(async(req,res)=>{
 const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
 if(pathname==='/__qa/upload' && req.method==='POST'){let chunks=[];for await(const c of req)chunks.push(c);const {path:p,data}=JSON.parse(Buffer.concat(chunks));files.set(p,data);res.end('ok');return;}
 if(pathname.startsWith('/__qa/files/')){const d=files.get(pathname.slice('/__qa/files/'.length));if(!d){res.writeHead(404);res.end();return;}const [,mime,base64]=d.match(/^data:([^;]+);base64,(.*)$/);res.setHeader('Content-Type',mime);res.end(Buffer.from(base64,'base64'));return;}
 if(pathname==='/js/supabaseClient.js'){res.setHeader('Content-Type','text/javascript');res.end('var previewSettings='+fs.readFileSync(path.join(root,'data/automation-settings.json'),'utf8')+';\n'+fs.readFileSync(path.join(__dirname,'preview-client.js'),'utf8'));return;}
 if(pathname==='/__qa/broken.jpg'){res.setHeader('Content-Type','image/jpeg');res.end('not an image');return;}
 let p=path.resolve(root,'.'+pathname);if(!p.startsWith(root+path.sep) && p!==root){res.writeHead(403);res.end();return;}
 try{if(fs.statSync(p).isDirectory()){if(!pathname.endsWith('/')){res.writeHead(301,{Location:pathname+'/'});res.end();return;}p=path.join(p,'index.html');}var data=fs.readFileSync(p);res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json'})[path.extname(p)]||'application/octet-stream');res.setHeader('Cache-Control','no-store');res.end(data);}catch{res.writeHead(404);res.end('Not found');}
}).listen(8943,'127.0.0.1',()=>console.log('QA preview: http://127.0.0.1:8943'));
