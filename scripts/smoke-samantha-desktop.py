import sys
if sys.platform != "darwin":
 raise SystemExit("Mac-only legacy mock persistence smoke; use scripts/test-samantha-bundle.ps1 on Windows.")
import json,os,pathlib,re,subprocess,tempfile,zipfile
with tempfile.TemporaryDirectory() as d:
 root=pathlib.Path(d); z=zipfile.ZipFile('dist/samantha-social-desk-0.5.0.mcpb')
 assert not any(w in n for n in z.namelist() for w in ('keychain','zernio.mjs','approval-gate','retention','test/'))
 z.extractall(d)
 m=json.loads((root/'manifest.json').read_text()); entry=root/m['server']['entry_point']; fixture=root/'chat-pilot/server/fixtures'
 assert m['version']=='0.5.0' and m['user_config']['pilot_mode']['default']=='off'
 env={**os.environ,'HOME':d}
 def req(mode,method,params=None,folder='',probe='off'):
  q={'jsonrpc':'2.0','id':1,'method':method}
  if params is not None:q['params']=params
  p=subprocess.run(['node',str(entry),mode,folder,probe],env=env,input=json.dumps(q)+'\n',text=True,capture_output=True,check=True,timeout=10)
  return json.loads(p.stdout)['result']
 def call(mode,name,args={},folder=''):
  return req(mode,'tools/call',{'name':name,'arguments':args},folder)
 assert req('off','initialize')['serverInfo']['version']=='0.5.0'
 assert [t['name'] for t in req('off','tools/list')['tools']]==['review_samantha_mock_reel','preflight_samantha_transfer']
 local=call('off','review_samantha_local_reel',{'contentId':'SJ-W03-R1'},str(fixture))
 assert local['content'][1]['mimeType']=='image/png' and 'LOCAL REVIEW ONLY' in local['content'][0]['text']
 r=call('mock','review_samantha_mock_reel'); text=r['content'][0]['text']
 b=re.search('Review binding ([a-f0-9]{64})',text)[1]
 c=re.search('Human confirmation to type for this target: (APPROVE MOCK INSTAGRAM [a-f0-9]{12})',text)[1]
 inp={'platform':'instagram','reviewBinding':b,'confirmation':c}
 assert 'MOCK VERIFIED DRAFT' in call('mock','save_samantha_mock_draft',inp)['content'][0]['text']
 assert 'never resubmit' in call('mock','save_samantha_mock_draft',inp)['content'][0]['text']
 print('Extracted install bundle: startup, default off, configured review with PNG, mock verified draft, restart duplicate prevention and no live draft transport in the bundle. Transfer HTTP tests are separate.')
