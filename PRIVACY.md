# Listen Loop 隐私政策 / Privacy Policy

生效日期 / Effective date: 2026-11-24

[中文](#中文) · [English](#english)

---

## 中文

**一句话：** Listen Loop 没有账号系统，不收集、不出售、不分享你的个人数据。你的练习数据只保存在你自己的浏览器里。

### 1. 保存在你电脑上的数据

插件用 Chrome 的本地存储（`chrome.storage.local`）保存以下内容，只在你的设备上，不会上传：

- 设置：界面语言、循环次数、语速、遮挡字幕等；
- 每个视频的练习进度，以及你对句子起止时间的调整；
- 错题本：视频 ID 和标题、句子的时间段和原文、你当时写的答案、听错的词、复习记录；
- 易错词统计、译文缓存。

卸载插件时，这些数据会一起删除。你可以在错题本页面导出备份文件，文件保存在你自己选择的位置。

### 2. 插件读取的网页内容

插件只在 `www.youtube.com` 上运行：

- 读取当前视频的英文字幕（就是 YouTube 播放器自己加载的那份），用来切句和批改；
- 控制页面上的视频播放（跳转、循环、调速）。

插件不读取其他网站，也不读取你的 YouTube 账号信息、观看记录或评论。

### 3. 翻译

「译文」使用 Chrome 内置的翻译功能（Translator API），在你的电脑上完成。第一次使用时，Chrome 会从 Google 下载翻译模型，这一步由 Chrome 完成，适用 Google 的隐私政策。句子内容不会发送给开发者或其他第三方。

### 4. 问题反馈

只有当你主动点击「反馈」时，插件才会在新标签页打开一个飞书（Feishu / Lark）表单。表单的「诊断信息」一栏会预先填好以下内容：

- 插件版本、浏览器和操作系统、界面语言和浏览器语言、当前时间；
- 当前视频 ID 和播放位置、字幕类型和获取方式、出错时的错误代码；
- 错题本里的句子数量。

这些内容放在打开表单的链接里，所以会被飞书的服务器收到；但只有你点了「提交」，开发者才能看到。提交前，你可以查看、修改或删掉任何内容。联系方式是选填的。

提交的反馈保存在开发者的飞书多维表格里，只用来排查问题和改进插件，不会出售或分享给他人。如果想删除你提交过的反馈，可以再提交一条反馈说明。飞书如何处理表单数据，适用飞书的隐私政策。

### 5. 我们不做的事

- 没有账号、统计分析、广告或追踪代码；
- 不加载、不执行远程代码；
- 不出售、不转让用户数据，不用于与插件功能无关的用途，也不用于判断信用或发放贷款。

Listen Loop 对数据的使用遵守 Chrome 应用商店用户数据政策，包括其中的「有限使用」要求。

### 6. 儿童

插件不面向 13 岁以下的儿童，也不会有意收集他们的信息。

### 7. 政策变更

政策有变化时，会更新本页面并修改上方的生效日期。

### 8. 联系方式

- 反馈表单：https://kil5372lmm.feishu.cn/share/base/form/shrcnn19XwOWed9x9NWZ0C1Io6i
- GitHub：https://github.com/rayjiu/listen-loop/issues

---

## English

**In short:** Listen Loop has no accounts. It does not collect, sell or share your personal data. Your practice data stays in your own browser.

### 1. Data stored on your device

The extension uses Chrome's local storage (`chrome.storage.local`) to keep the following on your device only:

- settings (interface language, loop count, speed, subtitle cover, and so on);
- per-video progress and any adjustments you made to sentence boundaries;
- your mistake notebook: video ID and title, the sentence's time range and text, the answer you typed, the words you missed, and your review history;
- missed-word statistics and cached translations.

Uninstalling the extension deletes all of it. You can export a backup from the notebook page; the file is saved wherever you choose.

### 2. Page content the extension reads

The extension runs only on `www.youtube.com`. It:

- reads the current video's English captions (the track the YouTube player itself loads) to split sentences and check your answers;
- controls the video on the page (seeking, looping, playback speed).

It does not read other websites, and it does not read your YouTube account, watch history or comments.

### 3. Translation

The translation hint uses Chrome's built-in Translator API and runs on your device. The first time you use it, Chrome downloads a translation model from Google; Google's privacy policy applies to that download. Sentences are never sent to the developer or any other third party.

### 4. Feedback

Only when you click "Send feedback" does the extension open a Feishu (Lark) form in a new tab. The form's "Diagnostics" field is pre-filled with:

- extension version, browser and OS, interface and browser languages, the current time;
- the current video ID and playback position, the caption type and how it was loaded, and an error code if there was one;
- the number of sentences in your notebook.

These values are part of the form's link, so Feishu's servers receive them when the form opens. The developer sees them only if you press Submit. You can review, edit or delete any of it first. The contact field is optional.

Submitted feedback is stored in the developer's Feishu Base and is used only to fix problems and improve the extension. It is never sold or shared. To have your feedback deleted, send another feedback message asking for it. Feishu's privacy policy applies to how Feishu handles form data.

### 5. What we don't do

- no accounts, analytics, ads or tracking code;
- no remote code is loaded or run;
- user data is never sold or transferred, never used for purposes unrelated to the extension, and never used to determine creditworthiness or for lending.

Listen Loop's use of information complies with the Chrome Web Store User Data Policy, including the Limited Use requirements.

### 6. Children

Listen Loop is not directed at children under 13 and does not knowingly collect their information.

### 7. Changes

If this policy changes, this page is updated and the effective date above changes.

### 8. Contact

- Feedback form: https://kil5372lmm.feishu.cn/share/base/form/shrcnn19XwOWed9x9NWZ0C1Io6i
- GitHub: https://github.com/rayjiu/listen-loop/issues
