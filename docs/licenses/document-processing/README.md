# Document processing notice evidence

This is an incomplete internal evidence bundle. It does not approve distribution.
The 46 notice files preserve the previously retained bytes.
No license choice replaces a copyright notice or exact binary source proof.

## Version and source boundary

| Package | Exact approved or locked version |
| --- | --- |
| pdfjs-dist | 6.3.289 |
| mammoth | 1.13.0 |
| sharp | 0.35.5 |
| @napi-rs/canvas | 1.0.10 |
| @img/sharp-win32-x64 | 0.35.5 |
| @napi-rs/canvas-win32-x64-msvc | 1.0.10 |
| JSZip | 3.10.2 |

The first three versions were explicitly approved and installed.
Canvas and its Windows binary are locked optional PDF dependencies.
The closure review recorded 69 locked packages and 33 installed packages.
This folder contains their 42 retained notice files and four retained inline extracts.
It contains no downloaded code, image, native binary, or new dependency.

The exact source mapping is in [NOTICE-SOURCES.json](NOTICE-SOURCES.json).
The exact copied output hashes are in [OUTPUT-MANIFEST.json](OUTPUT-MANIFEST.json).
The predecessor is the frozen `document-dependency-notice-review-2026-10-04` scratch packet.
Its manifest SHA256 is `e08ef5b4413d865d8e1430b15a6227af4a592529bb0824a8eb9b481a9d4d8f9f`.
The approved package SHA256 is `fada8f89c4078012125590394f33dae9df34c75311fc62e1fa1a8f36ce2c06d1`.
The approved lock SHA256 is `3661b32594ac594e13a368d07f2cd96db971ccba6be154ce5fc255d96b839c0e`.

## JSZip choice

Use the permitted MIT branch for JSZip in the planned distribution.
Keep its full [original dual-license notice](notices/npm/jszip/LICENSE.markdown) unchanged.
The original file contains both alternatives. Their presence does not mandate GPL use.
This recommendation does not select a license for unrelated font or native components.

## Unresolved gaps

- The Windows sharp license file contains Apache text only. Its README names several other licenses.
- Its 28 versioned native components lack locally verified full notices, copyright texts, and exact corresponding-source evidence.
- Its 29 license rows include libnsgif without an exact version. The mozjpeg revision `0826579` is incomplete.
- The LGPL path lacks verified source, build patches, and suitable replacement or relinking proof for the actual conveyed artifact.
- MPL1.1, FreeType, fontconfig, libpng, IJG, and other custom native terms require exact component checks.
- The AOM patent terms need retention and review against the exact binary source and notice set.
- Canvas supplies a wrapper MIT text but no installed binary-specific notice. Exact Skia, ICU, Rust, and other native notices remain unproved.
- The canvas README names Skia `chrome/m156`. It does not prove the exact compiled commit or ICU data version.
- PDF.js Liberation fonts have GPLv2 terms and a document exception. Any conveyed font binary needs its applicable source path.
- PDF font, ICC, and WASM source/version associations remain incomplete despite the retained local notices.
- No final build trace, container image, client asset set, or customer distribution archive was checked.
- The 36 other locked optional packages are absent locally. Their target-specific notices and native closure remain unverified.
- Linux and Node 22 acceptance remain unverified. Windows Node 24 results cannot establish those results.
- No external source offer, published notice page, or final artifact notice retention was verified.

Server use does not itself prove that no copy is conveyed.
Check the actual deployment, image, and customer delivery model before applying that distinction.
Keep native source requirements separate from ordinary application source.
Do not infer that the whole application requires open-source publication from this inventory.

## Closure order

1. Identify the actual delivery targets and trace their exact package and asset hashes.
2. Resolve native and PDF source, version, license, and corresponding-source gaps.
3. Review the LGPL path and source availability for each conveyed target.
4. Keep applicable complete texts and inline notices in the final artifact.
5. Verify the actual target's notice bundle, Node 22 behavior, and Linux behavior separately.
6. Obtain approval before publishing notices or a source offer outside the repository.

## Complete retained notice files

| Original source path | Original source SHA256 | Copied notice | Notice SHA256 |
| --- | --- | --- | --- |
| `node_modules/@img/colour/LICENSE.md` | `e2eaa4603c14cb26f301e88648c12a853fa3f0f5da6d4b0972958c666e7f2ab8` | [notices/npm/@img/colour/LICENSE.md](notices/npm/@img/colour/LICENSE.md) | `e2eaa4603c14cb26f301e88648c12a853fa3f0f5da6d4b0972958c666e7f2ab8` |
| `node_modules/@img/sharp-win32-x64/LICENSE` | `dc1f5d2d43c5531dfe0acaf4e950ea5dbe3e61e1850cf0e983bda7efc10d6693` | [notices/npm/@img/sharp-win32-x64/LICENSE](notices/npm/@img/sharp-win32-x64/LICENSE) | `dc1f5d2d43c5531dfe0acaf4e950ea5dbe3e61e1850cf0e983bda7efc10d6693` |
| `node_modules/@napi-rs/canvas/LICENSE` | `8802fecf9da4367bc23bcf20b21cc143785fc6c92b152f3fa7fbe6ce08d344d6` | [notices/npm/@napi-rs/canvas/LICENSE](notices/npm/@napi-rs/canvas/LICENSE) | `8802fecf9da4367bc23bcf20b21cc143785fc6c92b152f3fa7fbe6ce08d344d6` |
| `node_modules/@xmldom/xmldom/LICENSE` | `4da724fc305d81606b245b324d4d2586916b9d248b23d82183df753ace0fdf71` | [notices/npm/@xmldom/xmldom/LICENSE](notices/npm/@xmldom/xmldom/LICENSE) | `4da724fc305d81606b245b324d4d2586916b9d248b23d82183df753ace0fdf71` |
| `node_modules/base64-js/LICENSE` | `5b37224c080cdcc97c871ada971c224e9926370fe74f11b539aa1cf9f3b1aca1` | [notices/npm/base64-js/LICENSE](notices/npm/base64-js/LICENSE) | `5b37224c080cdcc97c871ada971c224e9926370fe74f11b539aa1cf9f3b1aca1` |
| `node_modules/core-util-is/LICENSE` | `33b734d60042d0fe0c92dd1fc1e874193a1c899ec3e276a2eb935d2d0bf5b710` | [notices/npm/core-util-is/LICENSE](notices/npm/core-util-is/LICENSE) | `33b734d60042d0fe0c92dd1fc1e874193a1c899ec3e276a2eb935d2d0bf5b710` |
| `node_modules/detect-libc/LICENSE` | `b40930bbcf80744c86c46a12bc9da056641d722716c378f5659b9e555ef833e1` | [notices/npm/detect-libc/LICENSE](notices/npm/detect-libc/LICENSE) | `b40930bbcf80744c86c46a12bc9da056641d722716c378f5659b9e555ef833e1` |
| `node_modules/dingbat-to-unicode/LICENSE` | `1013cef4b629a3c7eaf737c110fb5bebbf3abbc16e154d769468d71c3653fa37` | [notices/npm/dingbat-to-unicode/LICENSE](notices/npm/dingbat-to-unicode/LICENSE) | `1013cef4b629a3c7eaf737c110fb5bebbf3abbc16e154d769468d71c3653fa37` |
| `node_modules/duck/LICENSE` | `6663bbd049205d38a496ccacb412a151980b444627d38de218b3b809aef330f1` | [notices/npm/duck/LICENSE](notices/npm/duck/LICENSE) | `6663bbd049205d38a496ccacb412a151980b444627d38de218b3b809aef330f1` |
| `node_modules/immediate/LICENSE.txt` | `809e66de579fb7d92503848bbe6d1f348f4f6521a71e5d294fe7cc0c87a3b4ff` | [notices/npm/immediate/LICENSE.txt](notices/npm/immediate/LICENSE.txt) | `809e66de579fb7d92503848bbe6d1f348f4f6521a71e5d294fe7cc0c87a3b4ff` |
| `node_modules/inherits/LICENSE` | `5ffe28e7ade7d8f10d85d5337a73fd793dac5c462fb9a28fbf8c5046c7fbca3b` | [notices/npm/inherits/LICENSE](notices/npm/inherits/LICENSE) | `5ffe28e7ade7d8f10d85d5337a73fd793dac5c462fb9a28fbf8c5046c7fbca3b` |
| `node_modules/jszip/lib/license_header.js` | `27873abeec2df3693480a8d1b8fe17dd61bee843d1b39c1c9cfab57ffe93099e` | [notices/npm/jszip/lib/license_header.js.txt](notices/npm/jszip/lib/license_header.js.txt) | `27873abeec2df3693480a8d1b8fe17dd61bee843d1b39c1c9cfab57ffe93099e` |
| `node_modules/jszip/LICENSE.markdown` | `566c953c6090b1218ca6217dd7359d45dde46581968586dc607d59a78af6a9c4` | [notices/npm/jszip/LICENSE.markdown](notices/npm/jszip/LICENSE.markdown) | `566c953c6090b1218ca6217dd7359d45dde46581968586dc607d59a78af6a9c4` |
| `node_modules/lie/license.md` | `5c81b0caa98593408b03125efa25efe622341ed87ae55561968828cd887d64a4` | [notices/npm/lie/license.md](notices/npm/lie/license.md) | `5c81b0caa98593408b03125efa25efe622341ed87ae55561968828cd887d64a4` |
| `node_modules/lop/LICENSE` | `6663bbd049205d38a496ccacb412a151980b444627d38de218b3b809aef330f1` | [notices/npm/lop/LICENSE](notices/npm/lop/LICENSE) | `6663bbd049205d38a496ccacb412a151980b444627d38de218b3b809aef330f1` |
| `node_modules/mammoth/LICENSE` | `6663bbd049205d38a496ccacb412a151980b444627d38de218b3b809aef330f1` | [notices/npm/mammoth/LICENSE](notices/npm/mammoth/LICENSE) | `6663bbd049205d38a496ccacb412a151980b444627d38de218b3b809aef330f1` |
| `node_modules/mammoth/node_modules/argparse/LICENSE` | `c8442419dc614089ea022b3da6bfc089b41a58fb7b9030d1e651f2f36189dce2` | [notices/npm/mammoth/node_modules/argparse/LICENSE](notices/npm/mammoth/node_modules/argparse/LICENSE) | `c8442419dc614089ea022b3da6bfc089b41a58fb7b9030d1e651f2f36189dce2` |
| `node_modules/option/LICENSE` | `6663bbd049205d38a496ccacb412a151980b444627d38de218b3b809aef330f1` | [notices/npm/option/LICENSE](notices/npm/option/LICENSE) | `6663bbd049205d38a496ccacb412a151980b444627d38de218b3b809aef330f1` |
| `node_modules/pako/LICENSE` | `a04665b3b2de56c66730c1f720f528175739e4104f79073614aa611da1e85539` | [notices/npm/pako/LICENSE](notices/npm/pako/LICENSE) | `a04665b3b2de56c66730c1f720f528175739e4104f79073614aa611da1e85539` |
| `node_modules/pdfjs-dist/cmaps/LICENSE` | `aa92ab5a472974865a96fd4a4e9c13bb41bf6fe1b309cb6b8da48bc9e19839a2` | [notices/npm/pdfjs-dist/cmaps/LICENSE](notices/npm/pdfjs-dist/cmaps/LICENSE) | `aa92ab5a472974865a96fd4a4e9c13bb41bf6fe1b309cb6b8da48bc9e19839a2` |
| `node_modules/pdfjs-dist/iccs/LICENSE` | `286e4fd7b447330b2c88e23890e3cd0a9d38cb398d4a59cb247f578ccbda3213` | [notices/npm/pdfjs-dist/iccs/LICENSE](notices/npm/pdfjs-dist/iccs/LICENSE) | `286e4fd7b447330b2c88e23890e3cd0a9d38cb398d4a59cb247f578ccbda3213` |
| `node_modules/pdfjs-dist/LICENSE` | `0d542e0c8804e39aa7f37eb00da5a762149dc682d7829451287e11b938e94594` | [notices/npm/pdfjs-dist/LICENSE](notices/npm/pdfjs-dist/LICENSE) | `0d542e0c8804e39aa7f37eb00da5a762149dc682d7829451287e11b938e94594` |
| `node_modules/pdfjs-dist/standard_fonts/LICENSE_FOXIT` | `b578cdd2345840ada550bd12519533812320d5f1d21cf4c1c7e1b1b0a31c98b7` | [notices/npm/pdfjs-dist/standard_fonts/LICENSE_FOXIT](notices/npm/pdfjs-dist/standard_fonts/LICENSE_FOXIT) | `b578cdd2345840ada550bd12519533812320d5f1d21cf4c1c7e1b1b0a31c98b7` |
| `node_modules/pdfjs-dist/standard_fonts/LICENSE_LIBERATION` | `d2c4d5b3e115a519cb58eb691aa64538397e2611f9ebe801392cf9667997e7dc` | [notices/npm/pdfjs-dist/standard_fonts/LICENSE_LIBERATION](notices/npm/pdfjs-dist/standard_fonts/LICENSE_LIBERATION) | `d2c4d5b3e115a519cb58eb691aa64538397e2611f9ebe801392cf9667997e7dc` |
| `node_modules/pdfjs-dist/wasm/LICENSE_JBIG2` | `9e66b7f1b934a28b37f3bc4dac97915de1674271e79a0a88182a18ed9731b4d1` | [notices/npm/pdfjs-dist/wasm/LICENSE_JBIG2](notices/npm/pdfjs-dist/wasm/LICENSE_JBIG2) | `9e66b7f1b934a28b37f3bc4dac97915de1674271e79a0a88182a18ed9731b4d1` |
| `node_modules/pdfjs-dist/wasm/LICENSE_OPENJPEG` | `a6af136f3e15038a666b61f376612a07d9a4e48cb7c01adbf3e33b3f14ab49b6` | [notices/npm/pdfjs-dist/wasm/LICENSE_OPENJPEG](notices/npm/pdfjs-dist/wasm/LICENSE_OPENJPEG) | `a6af136f3e15038a666b61f376612a07d9a4e48cb7c01adbf3e33b3f14ab49b6` |
| `node_modules/pdfjs-dist/wasm/LICENSE_PDFJS_JBIG2` | `aad3cce09842e00e9e11ad5e8fef8cc02fbc3a3768fe2f007443b9cee37aaee5` | [notices/npm/pdfjs-dist/wasm/LICENSE_PDFJS_JBIG2](notices/npm/pdfjs-dist/wasm/LICENSE_PDFJS_JBIG2) | `aad3cce09842e00e9e11ad5e8fef8cc02fbc3a3768fe2f007443b9cee37aaee5` |
| `node_modules/pdfjs-dist/wasm/LICENSE_PDFJS_OPENJPEG` | `717fc62da03292dbb4dd0c8280bd4ce7bb8550dcf31d772bc93455fb50313425` | [notices/npm/pdfjs-dist/wasm/LICENSE_PDFJS_OPENJPEG](notices/npm/pdfjs-dist/wasm/LICENSE_PDFJS_OPENJPEG) | `717fc62da03292dbb4dd0c8280bd4ce7bb8550dcf31d772bc93455fb50313425` |
| `node_modules/pdfjs-dist/wasm/LICENSE_PDFJS_QCMS` | `508a77d2e7b51d98adeed32648ad124b7b30241a8e70b2e72c99f92d8e5874d1` | [notices/npm/pdfjs-dist/wasm/LICENSE_PDFJS_QCMS](notices/npm/pdfjs-dist/wasm/LICENSE_PDFJS_QCMS) | `508a77d2e7b51d98adeed32648ad124b7b30241a8e70b2e72c99f92d8e5874d1` |
| `node_modules/pdfjs-dist/wasm/LICENSE_QCMS` | `36d847ae882f6574ebc72f56a4f354e4f104fde4a584373496482e97d52d31bc` | [notices/npm/pdfjs-dist/wasm/LICENSE_QCMS](notices/npm/pdfjs-dist/wasm/LICENSE_QCMS) | `36d847ae882f6574ebc72f56a4f354e4f104fde4a584373496482e97d52d31bc` |
| `node_modules/process-nextick-args/license.md` | `ecdccbcf39024f624ded480c01c0b25458e1eca8f26ecf040933865ce56d9a4f` | [notices/npm/process-nextick-args/license.md](notices/npm/process-nextick-args/license.md) | `ecdccbcf39024f624ded480c01c0b25458e1eca8f26ecf040933865ce56d9a4f` |
| `node_modules/readable-stream/LICENSE` | `ec62dc96da0099b87f4511736c87309335527fb7031639493e06c95728dc8c54` | [notices/npm/readable-stream/LICENSE](notices/npm/readable-stream/LICENSE) | `ec62dc96da0099b87f4511736c87309335527fb7031639493e06c95728dc8c54` |
| `node_modules/safe-buffer/LICENSE` | `c7cc929b57080f4b9d0c6cf57669f0463fc5b39906344dfc8d3bc43426b30eac` | [notices/npm/safe-buffer/LICENSE](notices/npm/safe-buffer/LICENSE) | `c7cc929b57080f4b9d0c6cf57669f0463fc5b39906344dfc8d3bc43426b30eac` |
| `node_modules/setimmediate/LICENSE.txt` | `c4b4ad3a5746f1f5249a6dd90396ec519264e1bb02e01e48a6522c48a3a97cb4` | [notices/npm/setimmediate/LICENSE.txt](notices/npm/setimmediate/LICENSE.txt) | `c4b4ad3a5746f1f5249a6dd90396ec519264e1bb02e01e48a6522c48a3a97cb4` |
| `node_modules/sharp/LICENSE` | `73ba74dfaa520b49a401b5d21459a8523a146f3b7518a833eea5efa85130bf68` | [notices/npm/sharp/LICENSE](notices/npm/sharp/LICENSE) | `73ba74dfaa520b49a401b5d21459a8523a146f3b7518a833eea5efa85130bf68` |
| `node_modules/sharp/node_modules/semver/LICENSE` | `4ec3d4c66cd87f5c8d8ad911b10f99bf27cb00cdfcff82621956e379186b016b` | [notices/npm/sharp/node_modules/semver/LICENSE](notices/npm/sharp/node_modules/semver/LICENSE) | `4ec3d4c66cd87f5c8d8ad911b10f99bf27cb00cdfcff82621956e379186b016b` |
| `node_modules/sprintf-js/LICENSE` | `a4cdda44b5adea4731d53dcae78fb5124f8fd853e994f01e25d8c33a7daf818b` | [notices/npm/sprintf-js/LICENSE](notices/npm/sprintf-js/LICENSE) | `a4cdda44b5adea4731d53dcae78fb5124f8fd853e994f01e25d8c33a7daf818b` |
| `node_modules/string_decoder/LICENSE` | `11f2aafb37d06b3ee5bdaf06e9811141d0da05263c316f3d627f45c20d43261b` | [notices/npm/string_decoder/LICENSE](notices/npm/string_decoder/LICENSE) | `11f2aafb37d06b3ee5bdaf06e9811141d0da05263c316f3d627f45c20d43261b` |
| `node_modules/tslib/LICENSE.txt` | `210b19e543130388c68654b7497e967119ce17145f66ab7d85688fbd70f08751` | [notices/npm/tslib/LICENSE.txt](notices/npm/tslib/LICENSE.txt) | `210b19e543130388c68654b7497e967119ce17145f66ab7d85688fbd70f08751` |
| `node_modules/underscore/LICENSE` | `92905fb54f5d168a27e6d5dc7c2197020add11842be4c70689d084bae3bfe37a` | [notices/npm/underscore/LICENSE](notices/npm/underscore/LICENSE) | `92905fb54f5d168a27e6d5dc7c2197020add11842be4c70689d084bae3bfe37a` |
| `node_modules/util-deprecate/LICENSE` | `0154425673db15cdfa80ecba2c9b1f1a867f7197a006764712849bfc3a93cbb7` | [notices/npm/util-deprecate/LICENSE](notices/npm/util-deprecate/LICENSE) | `0154425673db15cdfa80ecba2c9b1f1a867f7197a006764712849bfc3a93cbb7` |
| `node_modules/xmlbuilder/LICENSE` | `8ad16994acb18814fcd2ff6d0b559906b842047b995baf33fd0c55e4d24cbac8` | [notices/npm/xmlbuilder/LICENSE](notices/npm/xmlbuilder/LICENSE) | `8ad16994acb18814fcd2ff6d0b559906b842047b995baf33fd0c55e4d24cbac8` |

## Previously retained inline extracts

These copies preserve the exact extract bytes from the frozen predecessor.
The source hash identifies the full original file. The notice hash identifies the copied extract.

| Original source path | Original source SHA256 | Copied notice | Notice SHA256 |
| --- | --- | --- | --- |
| `node_modules/readable-stream/node_modules/isarray/README.md` | `ff138e683771b187f3629c383db72ee7d632009010a36d08e18e8d2a34222ec7` | [notices/supplemental/isarray-MIT-from-README.md](notices/supplemental/isarray-MIT-from-README.md) | `66aa9feab8bb39aceebd69f2a357015d57ceab486d3c7a19ff8d3d4110a6d101` |
| `node_modules/pako/lib/zlib/inflate.js` | `d31799a23f2ae87f0c52d21241c92278b41d23bb5365b452f2706d41b00c4245` | [notices/supplemental/pako-inflate.js.license.txt](notices/supplemental/pako-inflate.js.license.txt) | `54a5ea29bee0daa8883f4e559e8ffe48a37145b7e875612bcebb1f1c7a084939` |
| `node_modules/pako/lib/zlib/deflate.js` | `4b9b71ae7f42e506fe1fb134f1c21b944ef2b7ef79667ba1fe59eb963c353d22` | [notices/supplemental/pako-deflate.js.license.txt](notices/supplemental/pako-deflate.js.license.txt) | `54a5ea29bee0daa8883f4e559e8ffe48a37145b7e875612bcebb1f1c7a084939` |
| `node_modules/pako/lib/zlib/trees.js` | `718adbbf68f4343bf17d61edffd9d0788a96a93e4e191d857459d95257e614cf` | [notices/supplemental/pako-trees.js.license.txt](notices/supplemental/pako-trees.js.license.txt) | `ad3c862d4cf3acad9a6da823f7c5f808bf5aebbf53b2e9f3a9facb53c98e4f1a` |
