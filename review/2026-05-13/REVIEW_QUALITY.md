# REVIEW_QUALITY — LUDIARS Infra (2026-05-13)

## Q1. migrate.sh と migrate.mjs の二重実装が drift — B
- 根拠: `migrate.sh:64-201` と `migrate.mjs:106-256` がほぼ同じ機能を別言語で再実装している。README.md:55 で「Bash 環境では migrate.sh も使える」と並列扱い。今回の改修 (cross-env, drizzle-push, ignorable codes) はどちらも両方に書き込む必要があり、 既に細部 (sh は `grep -v "already exists"` / mjs は `IGNORABLE_PG_CODES` の 6 種) で挙動が違う。
- 影響: バグ修正の片落ち、 仕様の正本不在。
- 推奨: 既に Node が動く前提なので migrate.sh は廃止予告し、 README は `node migrate.mjs` のみ案内。 もしくは migrate.sh を `node migrate.mjs "$@"` の thin wrapper にする。

## Q2. migrate.sh の YAML パーサが grep/awk で fragile — B
- 根拠: `migrate.sh:50,56-61` は `^ {2}[a-z_]+:$` 等の正規表現で YAML を読む。services.yaml にコメントやインデント揺らぎが混ざると key を sniff し損なう。
- 影響: services.yaml に YAML 標準で正当な記述 (block scalar、 `>-` など) を追加すると無言で fail。
- 推奨: bash 版で yq に依存させるか、 Q1 と合わせて Node 一本化。

## Q3. README が schema/ ディレクトリと scripts/rancher-migration に触れていない — C
- 根拠: `schema/{cernere,curare,schedula}.ts` と `scripts/rancher-migration/` がトラックされているが、 README.md には言及無し。 drizzle-kit studio 起動は package.json:9-11 のみで分かる。
- 影響: 新人が drizzle studio を使う時にスクリプトの存在を見落とす。
- 推奨: README に「Drizzle Studio (DB 別 GUI)」と「Docker volume backup スクリプト」のセクション追加。

## Q4. PORT-MAP.md 内に解消済記述と最新日付の二重情報 — D
- 根拠: `PORT-MAP.md:5` `最終更新: 2026-05-02 (Quaestor 追加)` だが、 `:66-70` の 9001 衝突は未解消のまま、 `:118-128` の Legatus は「設計中」。 一方で memory には `PR #1 で scaffold + 28 テスト pass` と完成済 (Legatus はもう v0.1)。
- 影響: 正本のはずの PORT-MAP が最新状態に追随できておらず、 他リポからこのファイルを linked source として参照しても古い情報を撒く。
- 推奨: 月次で `/ludiars-status` の前後に PORT-MAP の status を sweep する task を Excubitor に登録。少なくとも `9001 解消案` と Legatus の status は今すぐ更新可能。
