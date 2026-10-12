#!/usr/bin/env node
/**
 * Mac 上の DB へ SSH ポートフォワードを張り続ける常駐プロセス。
 *
 * Mac 側の docker は 127.0.0.1 に bind したまま (どのネットワークにも出さない)、
 * このトンネルが Windows 側に 127.0.0.1:<port> の受け口を作る。
 * これにより Excubitor catalog の env や Infisical の secret を書き換えずに済む。
 *
 * 常駐プロセスなので落ちたら全サービスが DB を失う。Excubitor の
 * restart_policy による自動再起動が前提 (excubitor.catalog.yaml 参照)。
 * ssh 側にも keepalive を付け、無応答時は速やかに終了して再起動を促す。
 */

import { spawn } from 'node:child_process';

const HOST = process.env.MAC_TUNNEL_HOST;
const USER = process.env.MAC_TUNNEL_USER;
const PORTS = (process.env.MAC_TUNNEL_PORTS ?? '5432,6379,8931')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

if (!HOST) {
  console.error('[mac-tunnel] MAC_TUNNEL_HOST が未設定です (.env.mac-tunnel に Mac のホスト名を書く)');
  process.exit(2);
}
if (!USER) {
  console.error('[mac-tunnel] MAC_TUNNEL_USER が未設定です (Mac のログインユーザ名)');
  process.exit(2);
}
for (const p of PORTS) {
  if (!/^\d+$/.test(p)) {
    console.error(`[mac-tunnel] MAC_TUNNEL_PORTS に数値でない値: ${p}`);
    process.exit(2);
  }
}

const args = [
  '-N',                                   // コマンドを実行せずフォワードだけ
  '-o', 'ServerAliveInterval=15',         // 15 秒ごとに生存確認
  '-o', 'ServerAliveCountMax=3',          // 3 回連続無応答で切断 = 約 45 秒で検知
  '-o', 'ExitOnForwardFailure=yes',       // フォワードを張れなければ起動失敗にする
  '-o', 'StrictHostKeyChecking=accept-new',
  '-o', 'BatchMode=yes',                  // パスフレーズ待ちで無言ハングさせない
];

for (const p of PORTS) {
  // ローカル 127.0.0.1:<p> -> Mac の中の 127.0.0.1:<p>
  args.push('-L', `127.0.0.1:${p}:127.0.0.1:${p}`);
}
args.push(`${USER}@${HOST}`);

console.log(`[mac-tunnel] ssh ${USER}@${HOST} forward=${PORTS.join(',')}`);

const child = spawn('ssh', args, { stdio: ['ignore', 'inherit', 'inherit'] });

child.on('error', (err) => {
  console.error(`[mac-tunnel] ssh を起動できませんでした: ${err.message}`);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  console.error(`[mac-tunnel] ssh が終了しました (code=${code} signal=${signal})`);
  process.exit(code ?? 1);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    child.kill();
    process.exit(0);
  });
}
