import { randomBytes } from 'node:crypto';
import { Controller, Get, Module, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../auth/public.decorator.js';

/**
 * The two web pages Supabase's emails link to: "confirm your email" and "reset your password".
 * Supabase puts the result (or a one-time recovery token) after # in the address, which never reaches this server;
 * the small script on each page reads it in the browser. The new password goes from the page straight to Supabase.
 */

const STYLE = `body{font-family:-apple-system,system-ui,sans-serif;background:#FDF4F2;color:#2B1F22;margin:0;padding:48px 24px;text-align:center}
h1{font-size:24px;margin:0 0 12px}p{font-size:16px;line-height:1.5;margin:0 auto 16px;max-width:420px}
form{max-width:340px;margin:24px auto 0;text-align:left}label{display:block;font-size:14px;margin:14px 0 6px}
input{box-sizing:border-box;width:100%;height:48px;padding:0 14px;border:1px solid #D8DADC;border-radius:10px;font-size:16px;background:#fff}
button{width:100%;height:50px;margin-top:22px;border:0;border-radius:25px;background:#9C6470;color:#fff;font-size:16px}
button:disabled{opacity:.5}.error{color:#C0362F;font-size:14px;margin-top:12px;min-height:20px}[hidden]{display:none}`;

function page(title: string, body: string, script: string, nonce: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer"><title>${title}</title><style>${STYLE}</style></head>
<body>${body}<script nonce="${nonce}">${script}</script></body></html>`;
}

/** Reads Supabase's #key=value result and removes it from the address bar so tokens are not left in history. */
const READ_HASH = `var h=new URLSearchParams(location.hash.slice(1));history.replaceState(null,'',location.pathname);`;

const CONFIRMED_SCRIPT = `${READ_HASH}
if(h.get('error')||h.get('error_description')){
document.getElementById('title').textContent='This link did not work';
document.getElementById('text').textContent='It may have expired or been used already. Open Clara and sign in. If your email is still not confirmed, sign up again to get a new link.';}`;

const CONFIRMED_BODY = `<h1 id="title">Email confirmed</h1>
<p id="text">Thank you. Go back to the Clara app and sign in with your email and password.</p>`;

const RESET_BODY = `<h1 id="title">Choose a new password</h1>
<p id="text">Enter a new password for your Clara account.</p>
<form id="form" hidden novalidate>
<label for="pw">New password</label><input id="pw" type="password" autocomplete="new-password" minlength="8" required>
<label for="pw2">Type it again</label><input id="pw2" type="password" autocomplete="new-password" minlength="8" required>
<div class="error" id="err" role="alert"></div>
<button id="btn" type="submit">Save new password</button></form>`;

function resetScript(supabaseUrl: string, publishableKey: string): string {
  return `${READ_HASH}
var url=${JSON.stringify(supabaseUrl)},key=${JSON.stringify(publishableKey)},token=h.get('access_token');
var title=document.getElementById('title'),text=document.getElementById('text'),form=document.getElementById('form'),err=document.getElementById('err'),btn=document.getElementById('btn');
function done(t,x){title.textContent=t;text.textContent=x;form.hidden=true;}
if(!token||h.get('type')!=='recovery'){done('This link did not work','It may have expired or been used already. In the Clara app, tap Forgot Password? on the sign-in screen to get a new link.');}
else{form.hidden=false;form.addEventListener('submit',function(e){e.preventDefault();
var pw=document.getElementById('pw').value,pw2=document.getElementById('pw2').value;
if(pw.length<8){err.textContent='Use at least 8 characters.';return;}
if(pw!==pw2){err.textContent='The two passwords are not the same.';return;}
err.textContent='';btn.disabled=true;btn.textContent='Saving…';
fetch(url+'/auth/v1/user',{method:'PUT',headers:{'Content-Type':'application/json',apikey:key,Authorization:'Bearer '+token},body:JSON.stringify({password:pw})})
.then(function(r){return r.json().catch(function(){return{};}).then(function(d){return{ok:r.ok,d:d};});})
.then(function(res){
if(res.ok){fetch(url+'/auth/v1/logout',{method:'POST',headers:{apikey:key,Authorization:'Bearer '+token}}).catch(function(){});
done('Password changed','Go back to the Clara app and sign in with your new password.');return;}
var c=res.d.error_code||res.d.code;
err.textContent=c==='same_password'?'Choose a password you have not used before.':c==='weak_password'?'Choose a stronger password.':(c==='session_expired'||c==='bad_jwt'||res.d.code===401)?'This link has expired. Ask for a new one from the Clara app.':'Could not save the password. Please try again.';
btn.disabled=false;btn.textContent='Save new password';})
.catch(function(){err.textContent='No connection. Check your internet and try again.';btn.disabled=false;btn.textContent='Save new password';});});}`;
}

@ApiExcludeController()
@Controller('auth')
export class AuthPagesController {
  constructor(private readonly config: ConfigService) {}

  @Public()
  @Get('confirmed')
  confirmed(@Res() response: Response): void {
    this.send(response, page('Email confirmed', CONFIRMED_BODY, CONFIRMED_SCRIPT, this.nonce(response)), false);
  }

  @Public()
  @Get('reset-password')
  resetPassword(@Res() response: Response): void {
    const supabaseUrl = this.config.get<string>('SUPABASE_URL')!;
    const key = this.config.get<string>('SUPABASE_PUBLISHABLE_KEY')!;
    this.send(response, page('Choose a new password', RESET_BODY, resetScript(supabaseUrl, key), this.nonce(response)), true);
  }

  /** A fresh nonce per page, so only this page's own script may run. */
  private nonce(response: Response): string {
    const nonce = randomBytes(16).toString('base64');
    response.locals.nonce = nonce;
    return nonce;
  }

  private send(response: Response, html: string, talksToSupabase: boolean): void {
    const nonce = response.locals.nonce as string;
    const connect = talksToSupabase ? ` connect-src ${this.config.get<string>('SUPABASE_URL')};` : '';
    response.setHeader(
      'Content-Security-Policy',
      `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';${connect} base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
    );
    response.status(200).type('html').send(html);
  }
}

@Module({ controllers: [AuthPagesController] })
export class AuthPagesModule {}
