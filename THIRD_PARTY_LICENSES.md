# 第三方许可证

实招本身以 [Apache-2.0](LICENSE) 发布。本文列出项目使用的第三方字体和依赖包及其许可证。

依赖列表用 pnpm 自带的 `pnpm licenses list --json --prod`（运行时依赖）和 `pnpm licenses list --json`（全部依赖）生成，生成日期 2026-10-14，生成环境 macOS arm64。没有使用 `license-checker`：它按 npm 的扁平 `node_modules` 结构读取，在 pnpm 的符号链接结构下会漏包，pnpm 自带命令能直接读取锁文件解析出的依赖树，也不需要新增依赖。

## 字体

页面渲染时，下列字体会按页面实际用到的字做子集化后内嵌到生成的页面中。五款字体都使用 SIL Open Font License 1.1（OFL-1.1），允许随软件一起分发、嵌入和修改；修改后的字体仍须按 OFL-1.1 发布，并且不能单独出售。

| 字体 | 字体 id | npm 包 | 许可证 | 来源 |
|---|---|---|---|---|
| 思源黑体（Noto Sans SC） | `noto-sans-sc` | `@fontsource/noto-sans-sc` | OFL-1.1 | [notofonts/noto-cjk](https://github.com/notofonts/noto-cjk) |
| 思源宋体（Noto Serif SC） | `noto-serif-sc` | `@fontsource/noto-serif-sc` | OFL-1.1 | [notofonts/noto-cjk](https://github.com/notofonts/noto-cjk) |
| 霞鹜文楷（LXGW WenKai） | `lxgw-wenkai` | `lxgw-wenkai-webfont` | 字体文件 OFL-1.1；包内 CSS 为 MIT | [lxgw/LxgwWenKai](https://github.com/lxgw/LxgwWenKai) |
| 站酷小薇体（ZCOOL XiaoWei） | `zcool-xiaowei` | `@fontsource/zcool-xiaowei` | OFL-1.1 | [Google Fonts](https://fonts.google.com/specimen/ZCOOL+XiaoWei) |
| 站酷快乐体（ZCOOL KuaiLe） | `zcool-kuaile` | `@fontsource/zcool-kuaile` | OFL-1.1 | [Google Fonts](https://fonts.google.com/specimen/ZCOOL+KuaiLe) |

`lxgw-wenkai-webfont` 在 npm 上登记的许可证是 MIT（针对包内的 CSS），字体文件本身的许可见包内 `OFL.txt`，所以下方自动生成的表里它显示为 MIT。

## 图标与图片

- 模板不使用第三方图标库，装饰图案由模板内的 CSS 绘制。
- 评测样本 `eval/samples/` 中的图片由 `eval/scripts/make-synthetic-images.ts` 脚本生成，以 CC0 发布，各样本目录的 `LICENSE.txt` 有逐张说明。
- 运行时上传的商家照片不在仓库中，版权归商家所有。

## 需要特别说明的依赖

| 包 | 许可证 | 说明 |
|---|---|---|
| `libheif-js`（`heic-convert` 的依赖） | LGPL-3.0 | 用于把 iPhone 的 HEIC 照片转成通用格式。以未修改的 npm 包形式使用，没有静态链接进实招的代码；使用者可以自行替换该包。 |
| `@img/sharp-libvips-<平台>`（`sharp` 的预编译依赖） | LGPL-3.0-or-later | `sharp` 按平台安装的 libvips 动态库，未修改。因为是可选依赖，下方自动生成的列表只包含生成环境（macOS arm64）的版本，Linux / Docker 下对应的是 `@img/sharp-libvips-linux-<架构>`，许可证相同。 |
| `@img/sharp-<平台>` | Apache-2.0 | `sharp` 的预编译原生模块，同上按平台安装。 |
| `caniuse-lite`（Next.js 的依赖） | CC-BY-4.0 | 浏览器兼容性数据。 |
| `argparse` | Python-2.0 | 宽松许可证。 |

依赖中没有 GPL 或 AGPL 许可证的包。

## 运行时依赖（90 个）

许可证分布：MIT 53, ISC 12, BSD-2-Clause 7, BSD-3-Clause 5, OFL-1.1 4, Apache-2.0 4, Python-2.0 1, CC-BY-4.0 1, LGPL-3.0 1, (MIT AND Zlib) 1, 0BSD 1。

| 包 | 版本 | 许可证 | 主页 |
|---|---|---|---|
| `@borewit/text-codec` | 0.2.2 | MIT | [链接](https://github.com/Borewit/text-codec#readme) |
| `@fontsource/noto-sans-sc` | 5.3.1 | OFL-1.1 | [链接](https://fontsource.org/fonts/noto-sans-sc) |
| `@fontsource/noto-serif-sc` | 5.3.1 | OFL-1.1 | [链接](https://fontsource.org/fonts/noto-serif-sc) |
| `@fontsource/zcool-kuaile` | 5.3.0 | OFL-1.1 | [链接](https://fontsource.org/fonts/zcool-kuaile) |
| `@fontsource/zcool-xiaowei` | 5.3.0 | OFL-1.1 | [链接](https://fontsource.org/fonts/zcool-xiaowei) |
| `@img/colour` | 1.1.0 | MIT | [链接](https://github.com/lovell/colour#readme) |
| `@next/env` | 15.5.27 | MIT | [链接](https://github.com/vercel/next.js#readme) |
| `@swc/helpers` | 0.5.15 | Apache-2.0 | [链接](https://swc.rs) |
| `@tokenizer/inflate` | 0.4.1 | MIT | [链接](https://github.com/Borewit/tokenizer-inflate#readme) |
| `@tokenizer/token` | 0.3.0 | MIT | [链接](https://github.com/Borewit/tokenizer-token#readme) |
| `ansi-regex` | 5.0.1 | MIT | [链接](https://github.com/chalk/ansi-regex#readme) |
| `ansi-styles` | 4.3.0 | MIT | [链接](https://github.com/chalk/ansi-styles#readme) |
| `argparse` | 2.0.1 | Python-2.0 | [链接](https://github.com/nodeca/argparse#readme) |
| `better-sqlite3` | 13.0.3 | MIT | [链接](http://github.com/WiseLibs/better-sqlite3) |
| `boolbase` | 1.0.0 | ISC | [链接](https://github.com/fb55/boolbase) |
| `busboy` | 1.6.0 | MIT | [链接](https://github.com/mscdex/busboy#readme) |
| `camelcase` | 5.3.1 | MIT | [链接](https://github.com/sindresorhus/camelcase#readme) |
| `caniuse-lite` | 1.0.30001815 | CC-BY-4.0 | [链接](https://github.com/browserslist/caniuse-lite#readme) |
| `client-only` | 0.0.1 | MIT | [链接](https://reactjs.org/) |
| `cliui` | 6.0.0 | ISC | [链接](https://github.com/yargs/cliui#readme) |
| `color-convert` | 2.0.1 | MIT | [链接](https://github.com/Qix-/color-convert#readme) |
| `color-name` | 1.1.4 | MIT | [链接](https://github.com/colorjs/color-name) |
| `css-select` | 5.2.2 | BSD-2-Clause | [链接](https://github.com/fb55/css-select#readme) |
| `css-what` | 6.2.2 | BSD-2-Clause | [链接](https://github.com/fb55/css-what#readme) |
| `debug` | 4.4.3 | MIT | [链接](https://github.com/debug-js/debug#readme) |
| `decamelize` | 1.2.0 | MIT | [链接](https://github.com/sindresorhus/decamelize#readme) |
| `detect-libc` | 2.1.2 | Apache-2.0 | [链接](https://github.com/lovell/detect-libc#readme) |
| `dijkstrajs` | 1.0.3 | MIT | [链接](https://github.com/tcort/dijkstrajs) |
| `dom-serializer` | 2.0.0 | MIT | [链接](https://github.com/cheeriojs/dom-serializer#readme) |
| `domelementtype` | 2.3.0 | BSD-2-Clause | [链接](https://github.com/fb55/domelementtype#readme) |
| `domhandler` | 5.0.3 | BSD-2-Clause | [链接](https://github.com/fb55/domhandler#readme) |
| `domutils` | 3.2.2 | BSD-2-Clause | [链接](https://github.com/fb55/domutils#readme) |
| `drizzle-orm` | 0.45.4 | Apache-2.0 | [链接](https://orm.drizzle.team) |
| `emoji-regex` | 8.0.0 | MIT | [链接](https://mths.be/emoji-regex) |
| `entities` | 4.5.0, 8.1.0 | BSD-2-Clause | [链接](https://github.com/fb55/entities#readme) |
| `file-type` | 22.1.1 | MIT | [链接](https://github.com/sindresorhus/file-type#readme) |
| `find-up` | 4.1.0 | MIT | [链接](https://github.com/sindresorhus/find-up#readme) |
| `fontverter` | 2.0.0 | BSD-3-Clause | [链接](https://github.com/papandreou/fontverter#readme) |
| `get-caller-file` | 2.0.5 | ISC | [链接](https://github.com/stefanpenner/get-caller-file#readme) |
| `harfbuzzjs` | 1.6.3 | MIT | [链接](https://harfbuzz.github.io/harfbuzzjs) |
| `heic-convert` | 2.1.0 | ISC | [链接](https://github.com/catdad-experiments/heic-convert#readme) |
| `heic-decode` | 2.1.0 | ISC | [链接](https://github.com/catdad-experiments/heic-decode#readme) |
| `ieee754` | 1.2.1 | BSD-3-Clause | [链接](https://github.com/feross/ieee754#readme) |
| `is-fullwidth-code-point` | 3.0.0 | MIT | [链接](https://github.com/sindresorhus/is-fullwidth-code-point#readme) |
| `jpeg-js` | 0.4.4 | BSD-3-Clause | [链接](https://github.com/eugeneware/jpeg-js#readme) |
| `libheif-js` | 1.23.5 | LGPL-3.0 | [链接](https://github.com/catdad-experiments/libheif-js#readme) |
| `locate-path` | 5.0.0 | MIT | [链接](https://github.com/sindresorhus/locate-path#readme) |
| `lxgw-wenkai-webfont` | 1.7.0 | MIT | [链接](https://github.com/chawyehsu/lxgw-wenkai-webfont) |
| `ms` | 2.1.3 | MIT | [链接](https://github.com/vercel/ms#readme) |
| `nanoid` | 3.3.20, 6.0.2 | MIT | [链接](https://github.com/ai/nanoid#readme) |
| `next` | 15.5.27 | MIT | [链接](https://nextjs.org) |
| `node-addon-api` | 8.9.2 | MIT | [链接](https://github.com/nodejs/node-addon-api) |
| `node-html-parser` | 9.0.4 | MIT | [链接](https://github.com/taoqf/node-fast-html-parser) |
| `nth-check` | 2.1.1 | BSD-2-Clause | [链接](https://github.com/fb55/nth-check) |
| `p-limit` | 2.3.0, 3.1.0 | MIT | [链接](https://github.com/sindresorhus/p-limit#readme) |
| `p-locate` | 4.1.0 | MIT | [链接](https://github.com/sindresorhus/p-locate#readme) |
| `p-try` | 2.2.0 | MIT | [链接](https://github.com/sindresorhus/p-try#readme) |
| `pako` | 1.0.11 | (MIT AND Zlib) | [链接](https://github.com/nodeca/pako) |
| `path-exists` | 4.0.0 | MIT | [链接](https://github.com/sindresorhus/path-exists#readme) |
| `picocolors` | 1.1.1 | ISC | [链接](https://github.com/alexeyraspopov/picocolors#readme) |
| `pngjs` | 5.0.0, 6.0.0 | MIT | [链接](https://github.com/lukeapage/pngjs) |
| `postcss` | 8.4.31 | MIT | [链接](https://postcss.org/) |
| `qrcode` | 1.5.4 | MIT | [链接](http://github.com/soldair/node-qrcode) |
| `react` | 19.3.0 | MIT | [链接](https://react.dev/) |
| `react-dom` | 19.3.0 | MIT | [链接](https://react.dev/) |
| `require-directory` | 2.1.1 | MIT | [链接](https://github.com/troygoode/node-require-directory/) |
| `require-main-filename` | 2.0.0 | ISC | [链接](https://github.com/yargs/require-main-filename#readme) |
| `scheduler` | 0.28.0 | MIT | [链接](https://react.dev/) |
| `semver` | 7.8.5 | ISC | [链接](https://github.com/npm/node-semver#readme) |
| `set-blocking` | 2.0.0 | ISC | [链接](https://github.com/yargs/set-blocking#readme) |
| `sharp` | 0.35.5 | Apache-2.0 | [链接](https://sharp.pixelplumbing.com) |
| `source-map-js` | 1.2.2 | BSD-3-Clause | [链接](https://github.com/7rulnik/source-map-js) |
| `streamsearch` | 1.1.0 | MIT | [链接](https://github.com/mscdex/streamsearch#readme) |
| `string-width` | 4.2.3 | MIT | [链接](https://github.com/sindresorhus/string-width#readme) |
| `strip-ansi` | 6.0.1 | MIT | [链接](https://github.com/chalk/strip-ansi#readme) |
| `strtok3` | 10.3.5 | MIT | [链接](https://github.com/Borewit/strtok3#readme) |
| `styled-jsx` | 5.1.6 | MIT | [链接](https://github.com/vercel/styled-jsx#readme) |
| `subset-font` | 2.9.0 | BSD-3-Clause | [链接](https://github.com/papandreou/subset-font#readme) |
| `token-types` | 6.1.2 | MIT | [链接](https://github.com/Borewit/token-types#readme) |
| `tslib` | 2.8.1 | 0BSD | [链接](https://www.typescriptlang.org/) |
| `uint8array-extras` | 1.6.0 | MIT | [链接](https://github.com/sindresorhus/uint8array-extras#readme) |
| `wawoff2` | 2.0.1 | MIT | [链接](https://github.com/fontello/wawoff2#readme) |
| `which-module` | 2.0.1 | ISC | [链接](https://github.com/nexdrew/which-module#readme) |
| `woff2sfnt-sfnt2woff` | 1.0.0 | MIT | [链接](https://github.com/digi3colin/woff2sfnt-sfnt2woff#readme) |
| `wrap-ansi` | 6.2.0 | MIT | [链接](https://github.com/chalk/wrap-ansi#readme) |
| `y18n` | 4.0.3 | ISC | [链接](https://github.com/yargs/y18n) |
| `yargs` | 15.4.1 | MIT | [链接](https://yargs.js.org/) |
| `yargs-parser` | 18.1.3 | ISC | [链接](https://github.com/yargs/yargs-parser#readme) |
| `yocto-queue` | 0.1.0 | MIT | [链接](https://github.com/sindresorhus/yocto-queue#readme) |
| `zod` | 3.25.76 | MIT | [链接](https://zod.dev) |

## 开发依赖（307 个，不随应用分发）

许可证分布：MIT 263, Apache-2.0 22, BSD-2-Clause 7, ISC 7, MPL-2.0 3, BSD-3-Clause 2, LGPL-3.0-or-later 1, CC0-1.0 1, BlueOak-1.0.0 1。

<details>
<summary>展开完整列表</summary>

| 包 | 版本 | 许可证 | 主页 |
|---|---|---|---|
| `@drizzle-team/brocli` | 0.10.2 | Apache-2.0 | [链接](https://github.com/drizzle-team/brocli) |
| `@esbuild-kit/core-utils` | 3.3.2 | MIT | [链接](https://github.com/esbuild-kit/core-utils#readme) |
| `@esbuild-kit/esm-loader` | 2.6.5 | MIT | [链接](https://github.com/esbuild-kit/esm-loader#readme) |
| `@esbuild/darwin-arm64` | 0.18.20, 0.25.12, 0.28.2 | MIT | [链接](https://github.com/evanw/esbuild#readme) |
| `@eslint-community/eslint-utils` | 4.10.1 | MIT | [链接](https://github.com/eslint-community/eslint-utils#readme) |
| `@eslint-community/regexpp` | 4.12.2 | MIT | [链接](https://github.com/eslint-community/regexpp#readme) |
| `@eslint/config-array` | 0.21.2 | Apache-2.0 | [链接](https://github.com/eslint/rewrite/tree/main/packages/config-array#readme) |
| `@eslint/config-helpers` | 0.4.2 | Apache-2.0 | [链接](https://github.com/eslint/rewrite/tree/main/packages/config-helpers#readme) |
| `@eslint/core` | 0.17.0 | Apache-2.0 | [链接](https://github.com/eslint/rewrite/tree/main/packages/core#readme) |
| `@eslint/eslintrc` | 3.3.7 | MIT | [链接](https://github.com/eslint/eslintrc#readme) |
| `@eslint/js` | 9.39.4 | MIT | [链接](https://eslint.org) |
| `@eslint/object-schema` | 2.1.7 | Apache-2.0 | [链接](https://github.com/eslint/rewrite/tree/main/packages/object-schema#readme) |
| `@eslint/plugin-kit` | 0.4.1 | Apache-2.0 | [链接](https://github.com/eslint/rewrite/tree/main/packages/plugin-kit#readme) |
| `@humanfs/core` | 0.19.2 | Apache-2.0 | [链接](https://github.com/humanwhocodes/humanfs#readme) |
| `@humanfs/node` | 0.16.8 | Apache-2.0 | [链接](https://github.com/humanwhocodes/humanfs#readme) |
| `@humanfs/types` | 0.15.0 | Apache-2.0 | [链接](https://github.com/humanwhocodes/humanfs#readme) |
| `@humanwhocodes/module-importer` | 1.0.1 | Apache-2.0 | [链接](https://github.com/humanwhocodes/module-importer#readme) |
| `@humanwhocodes/retry` | 0.4.3 | Apache-2.0 | [链接](https://github.com/humanwhocodes/retry#readme) |
| `@img/sharp-darwin-arm64` | 0.35.5 | Apache-2.0 | [链接](https://sharp.pixelplumbing.com) |
| `@img/sharp-libvips-darwin-arm64` | 1.3.4 | LGPL-3.0-or-later | [链接](https://sharp.pixelplumbing.com) |
| `@jridgewell/resolve-uri` | 3.1.2 | MIT | [链接](https://github.com/jridgewell/resolve-uri#readme) |
| `@jridgewell/sourcemap-codec` | 1.6.0 | MIT | [链接](https://github.com/jridgewell/sourcemaps/tree/main/packages/sourcemap-codec) |
| `@jridgewell/trace-mapping` | 0.3.31 | MIT | [链接](https://github.com/jridgewell/sourcemaps/tree/main/packages/trace-mapping) |
| `@next/eslint-plugin-next` | 15.5.27 | MIT | [链接](https://github.com/vercel/next.js#readme) |
| `@next/swc-darwin-arm64` | 15.5.27 | MIT | [链接](https://github.com/vercel/next.js#readme) |
| `@nodelib/fs.scandir` | 2.1.5 | MIT | [链接](https://github.com/nodelib/nodelib/tree/master#readme) |
| `@nodelib/fs.stat` | 2.0.5 | MIT | [链接](https://github.com/nodelib/nodelib/tree/master#readme) |
| `@nodelib/fs.walk` | 1.2.8 | MIT | [链接](https://github.com/nodelib/nodelib/tree/master#readme) |
| `@nolyfill/is-core-module` | 1.0.39 | MIT | [链接](https://github.com/SukkaW/nolyfill#readme) |
| `@oxc-project/types` | 0.153.0 | MIT | [链接](https://oxc.rs) |
| `@playwright/test` | 1.64.0 | Apache-2.0 | [链接](https://playwright.dev) |
| `@rolldown/binding-darwin-arm64` | 1.2.13 | MIT | [链接](https://rolldown.rs/) |
| `@rolldown/pluginutils` | 1.0.1 | MIT | [链接](https://github.com/rolldown/plugins/tree/main/packages/pluginutils#readme) |
| `@rtsao/scc` | 1.1.0 | MIT | [链接](https://github.com/rtsao/scc#readme) |
| `@rushstack/eslint-patch` | 1.16.1 | MIT | [链接](https://rushstack.io) |
| `@types/better-sqlite3` | 9.6.0 | MIT | [链接](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/better-sqlite3) |
| `@types/busboy` | 1.5.5 | MIT | [链接](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/busboy) |
| `@types/chai` | 5.2.3 | MIT | [链接](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/chai) |
| `@types/deep-eql` | 4.0.2 | MIT | [链接](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/deep-eql) |
| `@types/estree` | 1.0.9 | MIT | [链接](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/estree) |
| `@types/heic-convert` | 2.1.1 | MIT | [链接](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/heic-convert) |
| `@types/json-schema` | 7.0.15 | MIT | [链接](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/json-schema) |
| `@types/json5` | 0.0.29 | MIT | [链接](https://github.com/DefinitelyTyped/DefinitelyTyped#readme) |
| `@types/node` | 24.19.2, 26.6.5 | MIT | [链接](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/node) |
| `@types/qrcode` | 1.5.6 | MIT | [链接](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/qrcode) |
| `@types/react` | 19.3.0 | MIT | [链接](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/react) |
| `@types/react-dom` | 19.3.0 | MIT | [链接](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/react-dom) |
| `@typescript-eslint/eslint-plugin` | 8.71.1 | MIT | [链接](https://typescript-eslint.io/packages/eslint-plugin) |
| `@typescript-eslint/parser` | 8.71.1 | MIT | [链接](https://typescript-eslint.io/packages/parser) |
| `@typescript-eslint/project-service` | 8.71.1 | MIT | [链接](https://typescript-eslint.io) |
| `@typescript-eslint/scope-manager` | 8.71.1 | MIT | [链接](https://typescript-eslint.io/packages/scope-manager) |
| `@typescript-eslint/tsconfig-utils` | 8.71.1 | MIT | [链接](https://typescript-eslint.io) |
| `@typescript-eslint/type-utils` | 8.71.1 | MIT | [链接](https://typescript-eslint.io) |
| `@typescript-eslint/types` | 8.71.1 | MIT | [链接](https://typescript-eslint.io) |
| `@typescript-eslint/typescript-estree` | 8.71.1 | MIT | [链接](https://typescript-eslint.io/packages/typescript-estree) |
| `@typescript-eslint/utils` | 8.71.1 | MIT | [链接](https://typescript-eslint.io/packages/utils) |
| `@typescript-eslint/visitor-keys` | 8.71.1 | MIT | [链接](https://typescript-eslint.io) |
| `@unrs/resolver-binding-darwin-arm64` | 1.12.2 | MIT | [链接](https://github.com/unrs/unrs-resolver) |
| `@vitest/mocker` | 5.0.3 | MIT | [链接](https://github.com/vitest-dev/vitest/tree/main/packages/mocker) |
| `@vitest/spy` | 5.0.3 | MIT | [链接](https://vitest.dev/api/mock) |
| `acorn` | 8.19.0 | MIT | [链接](https://github.com/acornjs/acorn) |
| `acorn-jsx` | 5.3.2 | MIT | [链接](https://github.com/acornjs/acorn-jsx) |
| `ajv` | 6.15.0 | MIT | [链接](https://github.com/ajv-validator/ajv) |
| `aria-query` | 5.3.2 | Apache-2.0 | [链接](https://github.com/A11yance/aria-query#readme) |
| `array-buffer-byte-length` | 1.0.2 | MIT | [链接](https://github.com/inspect-js/array-buffer-byte-length#readme) |
| `array-includes` | 3.2.0 | MIT | [链接](https://github.com/es-shims/array-includes#readme) |
| `array.prototype.findlast` | 1.2.5 | MIT | [链接](https://github.com/es-shims/Array.prototype.findLast#readme) |
| `array.prototype.findlastindex` | 1.2.6 | MIT | [链接](https://github.com/es-shims/Array.prototype.findLastIndex#readme) |
| `array.prototype.flat` | 1.3.3 | MIT | [链接](https://github.com/es-shims/Array.prototype.flat#readme) |
| `array.prototype.flatmap` | 1.3.3 | MIT | [链接](https://github.com/es-shims/Array.prototype.flatMap#readme) |
| `array.prototype.tosorted` | 1.1.4 | MIT | [链接](https://github.com/es-shims/Array.prototype.toSorted#readme) |
| `arraybuffer.prototype.slice` | 1.0.4 | MIT | [链接](https://github.com/es-shims/ArrayBuffer.prototype.slice#readme) |
| `assertion-error` | 2.0.1 | MIT | [链接](https://github.com/chaijs/assertion-error#readme) |
| `ast-types-flow` | 0.0.8 | MIT | [链接](https://github.com/kyldvs/ast-types-flow#readme) |
| `async-function` | 1.0.0 | MIT | [链接](https://github.com/ljharb/async-function#readme) |
| `available-typed-arrays` | 1.0.7 | MIT | [链接](https://github.com/inspect-js/available-typed-arrays#readme) |
| `axe-core` | 4.14.0 | MPL-2.0 | [链接](https://www.deque.com/axe/) |
| `axobject-query` | 4.1.0 | Apache-2.0 | [链接](https://github.com/A11yance/axobject-query#readme) |
| `balanced-match` | 1.0.2, 4.0.4 | MIT | [链接](https://github.com/juliangruber/balanced-match#readme) |
| `brace-expansion` | 1.1.21, 5.0.12 | MIT | [链接](https://github.com/juliangruber/brace-expansion#readme) |
| `braces` | 3.0.3 | MIT | [链接](https://github.com/micromatch/braces) |
| `buffer-from` | 1.1.2 | MIT | [链接](https://github.com/LinusU/buffer-from#readme) |
| `call-bind` | 1.0.9 | MIT | [链接](https://github.com/ljharb/call-bind#readme) |
| `call-bind-apply-helpers` | 1.0.2 | MIT | [链接](https://github.com/ljharb/call-bind-apply-helpers#readme) |
| `call-bound` | 1.0.4 | MIT | [链接](https://github.com/ljharb/call-bound#readme) |
| `callsites` | 3.1.0 | MIT | [链接](https://github.com/sindresorhus/callsites#readme) |
| `chai` | 6.3.0 | MIT | [链接](http://chaijs.com) |
| `chalk` | 4.1.2 | MIT | [链接](https://github.com/chalk/chalk#readme) |
| `concat-map` | 0.0.1 | MIT | [链接](https://github.com/substack/node-concat-map#readme) |
| `cross-spawn` | 7.0.6 | MIT | [链接](https://github.com/moxystudio/node-cross-spawn) |
| `csstype` | 3.2.3 | MIT | [链接](https://github.com/frenic/csstype#readme) |
| `damerau-levenshtein` | 1.0.8 | BSD-2-Clause | [链接](https://github.com/tad-lispy/node-damerau-levenshtein#readme) |
| `data-view-buffer` | 1.0.2 | MIT | [链接](https://github.com/inspect-js/data-view-buffer#readme) |
| `data-view-byte-length` | 1.0.2 | MIT | [链接](https://github.com/inspect-js/data-view-byte-length#readme) |
| `data-view-byte-offset` | 1.0.1 | MIT | [链接](https://github.com/inspect-js/data-view-byte-offset#readme) |
| `deep-is` | 0.1.4 | MIT | [链接](https://github.com/thlorenz/deep-is#readme) |
| `define-data-property` | 1.1.4 | MIT | [链接](https://github.com/ljharb/define-data-property#readme) |
| `define-properties` | 1.2.1 | MIT | [链接](https://github.com/ljharb/define-properties#readme) |
| `doctrine` | 2.1.0 | Apache-2.0 | [链接](https://github.com/eslint/doctrine) |
| `drizzle-kit` | 0.31.11 | MIT | [链接](https://orm.drizzle.team) |
| `dunder-proto` | 1.0.1 | MIT | [链接](https://github.com/es-shims/dunder-proto#readme) |
| `es-abstract` | 1.24.2 | MIT | [链接](https://github.com/ljharb/es-abstract#readme) |
| `es-abstract-get` | 1.0.0 | MIT | [链接](https://github.com/ljharb/es-abstract-get#readme) |
| `es-define-property` | 1.0.1 | MIT | [链接](https://github.com/ljharb/es-define-property#readme) |
| `es-errors` | 1.3.0 | MIT | [链接](https://github.com/ljharb/es-errors#readme) |
| `es-iterator-helpers` | 1.4.0 | MIT | [链接](https://github.com/es-shims/iterator-helpers#readme) |
| `es-module-lexer` | 2.3.2 | MIT | [链接](https://github.com/guybedford/es-module-lexer#readme) |
| `es-object-atoms` | 1.1.2 | MIT | [链接](https://github.com/ljharb/es-object-atoms#readme) |
| `es-set-tostringtag` | 2.1.0 | MIT | [链接](https://github.com/es-shims/es-set-tostringtag#readme) |
| `es-shim-unscopables` | 1.1.0 | MIT | [链接](https://github.com/ljharb/es-shim-unscopables#readme) |
| `es-to-primitive` | 1.3.4 | MIT | [链接](https://github.com/ljharb/es-to-primitive#readme) |
| `esbuild` | 0.18.20, 0.25.12, 0.28.2 | MIT | [链接](https://github.com/evanw/esbuild#readme) |
| `escape-string-regexp` | 4.0.0 | MIT | [链接](https://github.com/sindresorhus/escape-string-regexp#readme) |
| `eslint` | 9.39.4 | MIT | [链接](https://eslint.org) |
| `eslint-config-next` | 15.5.27 | MIT | [链接](https://nextjs.org/docs/app/api-reference/config/eslint) |
| `eslint-import-resolver-node` | 0.3.10 | MIT | [链接](https://github.com/import-js/eslint-plugin-import) |
| `eslint-import-resolver-typescript` | 3.10.1 | ISC | [链接](https://github.com/import-js/eslint-import-resolver-typescript#readme) |
| `eslint-module-utils` | 2.14.0 | MIT | [链接](https://github.com/import-js/eslint-plugin-import#readme) |
| `eslint-plugin-import` | 2.32.0 | MIT | [链接](https://github.com/import-js/eslint-plugin-import) |
| `eslint-plugin-jsx-a11y` | 6.10.2 | MIT | [链接](https://github.com/jsx-eslint/eslint-plugin-jsx-a11y#readme) |
| `eslint-plugin-react` | 7.37.5 | MIT | [链接](https://github.com/jsx-eslint/eslint-plugin-react) |
| `eslint-plugin-react-hooks` | 5.2.0 | MIT | [链接](https://react.dev/) |
| `eslint-scope` | 8.4.0 | BSD-2-Clause | [链接](https://github.com/eslint/js/blob/main/packages/eslint-scope/README.md) |
| `eslint-visitor-keys` | 3.4.3, 4.2.1, 5.0.1 | Apache-2.0 | [链接](https://github.com/eslint/js/blob/main/packages/eslint-visitor-keys/README.md) |
| `espree` | 10.4.0 | BSD-2-Clause | [链接](https://github.com/eslint/js/blob/main/packages/espree/README.md) |
| `esquery` | 1.7.0 | BSD-3-Clause | [链接](https://github.com/estools/esquery/) |
| `esrecurse` | 4.3.0 | BSD-2-Clause | [链接](https://github.com/estools/esrecurse) |
| `estraverse` | 5.3.0 | BSD-2-Clause | [链接](https://github.com/estools/estraverse) |
| `estree-walker` | 3.0.3 | MIT | [链接](https://github.com/Rich-Harris/estree-walker#readme) |
| `esutils` | 2.0.3 | BSD-2-Clause | [链接](https://github.com/estools/esutils) |
| `expect-type` | 1.4.0 | Apache-2.0 | [链接](https://github.com/mmkal/expect-type#readme) |
| `fast-deep-equal` | 3.1.3 | MIT | [链接](https://github.com/epoberezkin/fast-deep-equal#readme) |
| `fast-glob` | 3.3.1 | MIT | [链接](https://github.com/mrmlnc/fast-glob#readme) |
| `fast-json-stable-stringify` | 2.1.0 | MIT | [链接](https://github.com/epoberezkin/fast-json-stable-stringify) |
| `fast-levenshtein` | 2.0.6 | MIT | [链接](https://github.com/hiddentao/fast-levenshtein#readme) |
| `fastq` | 1.20.3 | ISC | [链接](https://github.com/mcollina/fastq#readme) |
| `fdir` | 6.5.0 | MIT | [链接](https://github.com/thecodrr/fdir#readme) |
| `file-entry-cache` | 8.0.0 | MIT | [链接](https://github.com/jaredwray/file-entry-cache#readme) |
| `fill-range` | 7.1.1 | MIT | [链接](https://github.com/jonschlinkert/fill-range) |
| `flat-cache` | 4.0.1 | MIT | [链接](https://github.com/jaredwray/flat-cache#readme) |
| `flatted` | 3.4.4 | ISC | [链接](https://github.com/WebReflection/flatted#readme) |
| `for-each` | 0.3.5 | MIT | [链接](https://github.com/Raynos/for-each) |
| `fsevents` | 2.3.3 | MIT | [链接](https://github.com/fsevents/fsevents) |
| `function-bind` | 1.1.2 | MIT | [链接](https://github.com/Raynos/function-bind) |
| `function.prototype.name` | 1.2.0 | MIT | [链接](https://github.com/es-shims/Function.prototype.name#readme) |
| `functions-have-names` | 1.2.3 | MIT | [链接](https://github.com/inspect-js/functions-have-names#readme) |
| `generator-function` | 2.0.1 | MIT | [链接](https://github.com/TimothyGu/generator-function#readme) |
| `get-intrinsic` | 1.3.0 | MIT | [链接](https://github.com/ljharb/get-intrinsic#readme) |
| `get-proto` | 1.0.1 | MIT | [链接](https://github.com/ljharb/get-proto#readme) |
| `get-symbol-description` | 1.1.0 | MIT | [链接](https://github.com/inspect-js/get-symbol-description#readme) |
| `get-tsconfig` | 4.14.3 | MIT | [链接](https://github.com/privatenumber/get-tsconfig#readme) |
| `glob-parent` | 5.1.2, 6.0.2 | ISC | [链接](https://github.com/gulpjs/glob-parent#readme) |
| `globals` | 14.0.0 | MIT | [链接](https://github.com/sindresorhus/globals#readme) |
| `globalthis` | 1.0.4 | MIT | [链接](https://github.com/ljharb/System.global#readme) |
| `gopd` | 1.2.0 | MIT | [链接](https://github.com/ljharb/gopd#readme) |
| `has-bigints` | 1.1.0 | MIT | [链接](https://github.com/ljharb/has-bigints#readme) |
| `has-flag` | 4.0.0 | MIT | [链接](https://github.com/sindresorhus/has-flag#readme) |
| `has-property-descriptors` | 1.0.2 | MIT | [链接](https://github.com/inspect-js/has-property-descriptors#readme) |
| `has-proto` | 1.2.0 | MIT | [链接](https://github.com/inspect-js/has-proto#readme) |
| `has-symbols` | 1.1.0 | MIT | [链接](https://github.com/ljharb/has-symbols#readme) |
| `has-tostringtag` | 1.0.2 | MIT | [链接](https://github.com/inspect-js/has-tostringtag#readme) |
| `hasown` | 2.0.4 | MIT | [链接](https://github.com/inspect-js/hasOwn#readme) |
| `ignore` | 5.3.2, 7.0.12 | MIT | [链接](https://github.com/kaelzhang/node-ignore#readme) |
| `import-fresh` | 3.3.1 | MIT | [链接](https://github.com/sindresorhus/import-fresh#readme) |
| `imurmurhash` | 0.1.4 | MIT | [链接](https://github.com/jensyt/imurmurhash-js) |
| `internal-slot` | 1.1.0 | MIT | [链接](https://github.com/ljharb/internal-slot#readme) |
| `is-array-buffer` | 3.0.5 | MIT | [链接](https://github.com/inspect-js/is-array-buffer#readme) |
| `is-async-function` | 2.1.1 | MIT | [链接](https://github.com/inspect-js/is-async-function#readme) |
| `is-bigint` | 1.1.0 | MIT | [链接](https://github.com/inspect-js/is-bigint#readme) |
| `is-boolean-object` | 1.2.2 | MIT | [链接](https://github.com/inspect-js/is-boolean-object#readme) |
| `is-bun-module` | 2.0.0 | MIT | [链接](https://github.com/SunsetTechuila/is-bun-module) |
| `is-callable` | 1.2.7 | MIT | [链接](https://github.com/inspect-js/is-callable#readme) |
| `is-core-module` | 2.17.0 | MIT | [链接](https://github.com/inspect-js/is-core-module) |
| `is-data-view` | 1.0.2 | MIT | [链接](https://github.com/inspect-js/is-data-view#readme) |
| `is-date-object` | 1.1.0 | MIT | [链接](https://github.com/inspect-js/is-date-object#readme) |
| `is-document.all` | 1.0.0 | MIT | [链接](https://github.com/inspect-js/is-document.all#readme) |
| `is-extglob` | 2.1.1 | MIT | [链接](https://github.com/jonschlinkert/is-extglob) |
| `is-finalizationregistry` | 1.1.1 | MIT | [链接](https://github.com/inspect-js/is-finalizationregistry#readme) |
| `is-generator-function` | 1.1.2 | MIT | [链接](https://github.com/inspect-js/is-generator-function#readme) |
| `is-glob` | 4.0.3 | MIT | [链接](https://github.com/micromatch/is-glob) |
| `is-map` | 2.0.3 | MIT | [链接](https://github.com/inspect-js/is-map#readme) |
| `is-negative-zero` | 2.0.3 | MIT | [链接](https://github.com/inspect-js/is-negative-zero) |
| `is-number` | 7.0.0 | MIT | [链接](https://github.com/jonschlinkert/is-number) |
| `is-number-object` | 1.1.1 | MIT | [链接](https://github.com/inspect-js/is-number-object#readme) |
| `is-regex` | 1.2.1 | MIT | [链接](https://github.com/inspect-js/is-regex) |
| `is-set` | 2.0.3 | MIT | [链接](https://github.com/inspect-js/is-set#readme) |
| `is-shared-array-buffer` | 1.0.4 | MIT | [链接](https://github.com/inspect-js/is-shared-array-buffer#readme) |
| `is-string` | 1.1.1 | MIT | [链接](https://github.com/inspect-js/is-string#readme) |
| `is-symbol` | 1.1.1 | MIT | [链接](https://github.com/inspect-js/is-symbol#readme) |
| `is-typed-array` | 1.1.15 | MIT | [链接](https://github.com/inspect-js/is-typed-array#readme) |
| `is-weakmap` | 2.0.2 | MIT | [链接](https://github.com/inspect-js/is-weakmap#readme) |
| `is-weakref` | 1.1.1 | MIT | [链接](https://github.com/inspect-js/is-weakref#readme) |
| `is-weakset` | 2.0.4 | MIT | [链接](https://github.com/inspect-js/is-weakset#readme) |
| `isarray` | 2.0.5 | MIT | [链接](https://github.com/juliangruber/isarray) |
| `isexe` | 2.0.0 | ISC | [链接](https://github.com/isaacs/isexe#readme) |
| `iterator.prototype` | 1.1.5 | MIT | [链接](https://github.com/ljharb/Iterator.prototype#readme) |
| `js-tokens` | 4.0.0 | MIT | [链接](https://github.com/lydell/js-tokens#readme) |
| `js-yaml` | 4.3.2 | MIT | [链接](https://github.com/nodeca/js-yaml#readme) |
| `json-buffer` | 3.0.1 | MIT | [链接](https://github.com/dominictarr/json-buffer) |
| `json-schema-traverse` | 0.4.1 | MIT | [链接](https://github.com/epoberezkin/json-schema-traverse#readme) |
| `json-stable-stringify-without-jsonify` | 1.0.1 | MIT | [链接](https://github.com/samn/json-stable-stringify) |
| `json5` | 1.0.2 | MIT | [链接](http://json5.org/) |
| `jsqr` | 1.4.0 | Apache-2.0 | [链接](https://github.com/cozmo/jsQR#readme) |
| `jsx-ast-utils` | 3.3.5 | MIT | [链接](https://github.com/jsx-eslint/jsx-ast-utils#readme) |
| `keyv` | 4.5.4 | MIT | [链接](https://github.com/jaredwray/keyv) |
| `language-subtag-registry` | 0.3.23 | CC0-1.0 | [链接](https://github.com/mattcg/language-subtag-registry) |
| `language-tags` | 1.0.9 | MIT | [链接](https://github.com/mattcg/language-tags) |
| `levn` | 0.4.1 | MIT | [链接](https://github.com/gkz/levn) |
| `lightningcss` | 1.33.0 | MPL-2.0 | [链接](https://github.com/parcel-bundler/lightningcss#readme) |
| `lightningcss-darwin-arm64` | 1.33.0 | MPL-2.0 | [链接](https://github.com/parcel-bundler/lightningcss#readme) |
| `lodash.merge` | 4.6.2 | MIT | [链接](https://lodash.com/) |
| `loose-envify` | 1.4.0 | MIT | [链接](https://github.com/zertosh/loose-envify) |
| `magic-string` | 1.4.3 | MIT | [链接](https://github.com/Rich-Harris/magic-string#readme) |
| `math-intrinsics` | 1.1.0 | MIT | [链接](https://github.com/es-shims/math-intrinsics#readme) |
| `merge2` | 1.4.1 | MIT | [链接](https://github.com/teambition/merge2) |
| `micromatch` | 4.0.8 | MIT | [链接](https://github.com/micromatch/micromatch) |
| `minimatch` | 3.1.5 | ISC | [链接](https://github.com/isaacs/minimatch#readme) |
| `minimatch` | 10.2.6 | BlueOak-1.0.0 | [链接](https://github.com/isaacs/minimatch#readme) |
| `minimist` | 1.2.8 | MIT | [链接](https://github.com/minimistjs/minimist) |
| `napi-postinstall` | 0.3.4 | MIT | [链接](https://github.com/un-ts/napi-postinstall#readme) |
| `natural-compare` | 1.4.0 | MIT | [链接](https://github.com/litejs/natural-compare-lite#readme) |
| `node-exports-info` | 1.6.2 | MIT | [链接](https://github.com/inspect-js/node-exports-info#readme) |
| `object-assign` | 4.1.1 | MIT | [链接](https://github.com/sindresorhus/object-assign#readme) |
| `object-inspect` | 1.13.4 | MIT | [链接](https://github.com/inspect-js/object-inspect) |
| `object-keys` | 1.1.1 | MIT | [链接](https://github.com/ljharb/object-keys#readme) |
| `object.assign` | 4.1.7 | MIT | [链接](https://github.com/ljharb/object.assign#readme) |
| `object.entries` | 1.1.9 | MIT | [链接](https://github.com/es-shims/Object.entries#readme) |
| `object.fromentries` | 2.0.8 | MIT | [链接](https://github.com/es-shims/Object.fromEntries#readme) |
| `object.groupby` | 1.0.3 | MIT | [链接](https://github.com/es-shims/Object.groupBy#readme) |
| `object.values` | 1.2.1 | MIT | [链接](https://github.com/es-shims/Object.values#readme) |
| `obug` | 2.2.1 | MIT | [链接](https://github.com/sxzz/obug#readme) |
| `optionator` | 0.9.4 | MIT | [链接](https://github.com/gkz/optionator) |
| `own-keys` | 1.0.2 | MIT | [链接](https://github.com/ljharb/own-keys#readme) |
| `parent-module` | 1.0.1 | MIT | [链接](https://github.com/sindresorhus/parent-module#readme) |
| `path-key` | 3.1.1 | MIT | [链接](https://github.com/sindresorhus/path-key#readme) |
| `path-parse` | 1.0.7 | MIT | [链接](https://github.com/jbgutierrez/path-parse#readme) |
| `picomatch` | 2.3.2, 4.0.7 | MIT | [链接](https://github.com/micromatch/picomatch) |
| `playwright` | 1.64.0 | Apache-2.0 | [链接](https://playwright.dev) |
| `playwright-core` | 1.64.0 | Apache-2.0 | [链接](https://playwright.dev) |
| `possible-typed-array-names` | 1.1.0 | MIT | [链接](https://github.com/ljharb/possible-typed-array-names#readme) |
| `prelude-ls` | 1.2.1 | MIT | [链接](http://preludels.com) |
| `prettier` | 3.9.10 | MIT | [链接](https://prettier.io) |
| `prop-types` | 15.8.1 | MIT | [链接](https://facebook.github.io/react/) |
| `punycode` | 2.3.1 | MIT | [链接](https://mths.be/punycode) |
| `queue-microtask` | 1.2.3 | MIT | [链接](https://github.com/feross/queue-microtask) |
| `react-is` | 16.13.1 | MIT | [链接](https://reactjs.org/) |
| `reflect.getprototypeof` | 1.0.10 | MIT | [链接](https://github.com/es-shims/Reflect.getPrototypeOf) |
| `regexp.prototype.flags` | 1.5.4 | MIT | [链接](https://github.com/es-shims/RegExp.prototype.flags#readme) |
| `resolve` | 2.0.0-next.7 | MIT | [链接](https://github.com/browserify/resolve#readme) |
| `resolve-from` | 4.0.0 | MIT | [链接](https://github.com/sindresorhus/resolve-from#readme) |
| `resolve-pkg-maps` | 1.0.0 | MIT | [链接](https://github.com/privatenumber/resolve-pkg-maps#readme) |
| `reusify` | 1.1.0 | MIT | [链接](https://github.com/mcollina/reusify#readme) |
| `rolldown` | 1.2.13 | MIT | [链接](https://rolldown.rs/) |
| `run-parallel` | 1.2.0 | MIT | [链接](https://github.com/feross/run-parallel) |
| `safe-array-concat` | 1.1.4 | MIT | [链接](https://github.com/ljharb/safe-array-concat#readme) |
| `safe-push-apply` | 1.0.0 | MIT | [链接](https://github.com/ljharb/safe-push-apply#readme) |
| `safe-regex-test` | 1.1.0 | MIT | [链接](https://github.com/ljharb/safe-regex-test#readme) |
| `set-function-length` | 1.2.2 | MIT | [链接](https://github.com/ljharb/set-function-length#readme) |
| `set-function-name` | 2.0.2 | MIT | [链接](https://github.com/ljharb/set-function-name#readme) |
| `set-proto` | 1.0.0 | MIT | [链接](https://github.com/ljharb/set-proto#readme) |
| `shebang-command` | 2.0.0 | MIT | [链接](https://github.com/kevva/shebang-command#readme) |
| `shebang-regex` | 3.0.0 | MIT | [链接](https://github.com/sindresorhus/shebang-regex#readme) |
| `side-channel` | 1.1.1 | MIT | [链接](https://github.com/ljharb/side-channel#readme) |
| `side-channel-list` | 1.0.1 | MIT | [链接](https://github.com/ljharb/side-channel-list#readme) |
| `side-channel-map` | 1.0.1 | MIT | [链接](https://github.com/ljharb/side-channel-map#readme) |
| `side-channel-weakmap` | 1.0.2 | MIT | [链接](https://github.com/ljharb/side-channel-weakmap#readme) |
| `source-map` | 0.6.1 | BSD-3-Clause | [链接](https://github.com/mozilla/source-map) |
| `source-map-support` | 0.5.21 | MIT | [链接](https://github.com/evanw/node-source-map-support#readme) |
| `stable-hash` | 0.0.5 | MIT | [链接](https://github.com/shuding/stable-hash#readme) |
| `std-env` | 4.3.0 | MIT | [链接](https://github.com/unjs/std-env#readme) |
| `stop-iteration-iterator` | 1.1.0 | MIT | [链接](https://github.com/ljharb/stop-iteration-iterator#readme) |
| `string.prototype.includes` | 2.0.1 | MIT | [链接](https://mths.be/includes) |
| `string.prototype.matchall` | 4.1.0 | MIT | [链接](https://github.com/es-shims/String.prototype.matchAll#readme) |
| `string.prototype.repeat` | 1.0.0 | MIT | [链接](https://mths.be/repeat) |
| `string.prototype.trim` | 1.2.11 | MIT | [链接](https://github.com/es-shims/String.prototype.trim#readme) |
| `string.prototype.trimend` | 1.0.10 | MIT | [链接](https://github.com/es-shims/String.prototype.trimEnd#readme) |
| `string.prototype.trimstart` | 1.0.8 | MIT | [链接](https://github.com/es-shims/String.prototype.trimStart#readme) |
| `strip-bom` | 3.0.0 | MIT | [链接](https://github.com/sindresorhus/strip-bom#readme) |
| `strip-json-comments` | 3.1.1 | MIT | [链接](https://github.com/sindresorhus/strip-json-comments#readme) |
| `supports-color` | 7.2.0 | MIT | [链接](https://github.com/chalk/supports-color#readme) |
| `supports-preserve-symlinks-flag` | 1.0.0 | MIT | [链接](https://github.com/inspect-js/node-supports-preserve-symlinks-flag#readme) |
| `tinybench` | 6.2.1 | MIT | [链接](https://github.com/tinylibs/tinybench#readme) |
| `tinyexec` | 1.3.1 | MIT | [链接](https://github.com/tinylibs/tinyexec#readme) |
| `tinyglobby` | 0.2.17 | MIT | [链接](https://superchupu.dev/tinyglobby) |
| `to-regex-range` | 5.0.1 | MIT | [链接](https://github.com/micromatch/to-regex-range) |
| `ts-api-utils` | 2.5.0 | MIT | [链接](https://github.com/JoshuaKGoldberg/ts-api-utils#readme) |
| `tsconfig-paths` | 3.15.0 | MIT | [链接](https://github.com/dividab/tsconfig-paths#readme) |
| `tsx` | 4.23.15 | MIT | [链接](https://tsx.hirok.io) |
| `type-check` | 0.4.0 | MIT | [链接](https://github.com/gkz/type-check) |
| `typed-array-buffer` | 1.0.3 | MIT | [链接](https://github.com/inspect-js/typed-array-buffer#readme) |
| `typed-array-byte-length` | 1.0.3 | MIT | [链接](https://github.com/inspect-js/typed-array-byte-length#readme) |
| `typed-array-byte-offset` | 1.0.5 | MIT | [链接](https://github.com/inspect-js/typed-array-byte-offset#readme) |
| `typed-array-length` | 1.0.8 | MIT | [链接](https://github.com/inspect-js/typed-array-length#readme) |
| `typescript` | 5.9.3 | Apache-2.0 | [链接](https://www.typescriptlang.org/) |
| `unbox-primitive` | 1.1.0 | MIT | [链接](https://github.com/ljharb/unbox-primitive#readme) |
| `undici-types` | 7.24.6, 8.9.0 | MIT | [链接](https://undici.nodejs.org) |
| `unrs-resolver` | 1.12.2 | MIT | [链接](https://github.com/unrs/unrs-resolver) |
| `uri-js` | 4.4.1 | BSD-2-Clause | [链接](https://github.com/garycourt/uri-js) |
| `vite` | 8.3.4 | MIT | [链接](https://vite.dev) |
| `vitest` | 5.0.3 | MIT | [链接](https://vitest.dev) |
| `which` | 2.0.2 | ISC | [链接](https://github.com/isaacs/node-which#readme) |
| `which-boxed-primitive` | 1.1.1 | MIT | [链接](https://github.com/inspect-js/which-boxed-primitive#readme) |
| `which-builtin-type` | 1.2.1 | MIT | [链接](https://github.com/inspect-js/which-builtin-type#readme) |
| `which-collection` | 1.0.2 | MIT | [链接](https://github.com/inspect-js/which-collection#readme) |
| `which-typed-array` | 1.1.24 | MIT | [链接](https://github.com/inspect-js/which-typed-array#readme) |
| `why-is-node-running` | 3.2.1 | MIT | [链接](https://github.com/mafintosh/why-is-node-running) |
| `word-wrap` | 1.2.5 | MIT | [链接](https://github.com/jonschlinkert/word-wrap) |

</details>
