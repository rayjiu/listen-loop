# Chrome 应用商店上架材料

上架用到的所有文案和图片都在这里。后台地址：https://chrome.google.com/webstore/devconsole

- 文案：本文件，按后台的标签页顺序排列，代码块里的内容可以直接复制粘贴。
- 图片：`store/assets/`，用 `python3 store/make_assets.py` 重新生成（见第 6 节）。
- 安装包：`bash store/pack.sh`，生成 `dist/listen-loop-<版本号>.zip`。
- 隐私政策：仓库根目录的 `PRIVACY.md`（中英双语）。

## 0. 提交前检查

- [ ] 把 `feat/notebook` 合并到 `main` 并推送。隐私政策链接指向 main 分支上的 `PRIVACY.md`，没推送之前链接打不开。
- [ ] 注册开发者账号：一次性 5 美元，需要能付美元的信用卡。
- [ ] 运行 `bash store/pack.sh`，在后台「上传新软件包」里上传生成的 zip。
- [ ] 按下面第 1～4 节填写四个标签页。
- [ ] 提交审核。通常 1～3 个工作日，新账号的第一个插件有时会更久。

以后每次更新，都要先把 `manifest.json` 里的 `version` 改大，再打包上传。

## 1. 商品详情（Store listing）

### 名称和摘要

这两项不在后台填写，而是从安装包里读取（`_locales/*/messages.json` 里的 `extName` 和 `extDesc`）。目前的内容：

| 语言 | 名称 | 摘要（不超过 132 个字符） |
|---|---|---|
| English（默认） | Listen Loop — Dictation practice for YouTube | Practice English listening on YouTube: loop each sentence, type what you hear, get word-by-word feedback, and review your mistakes. |
| 中文（简体） | Listen Loop — YouTube 英语精听听写 | YouTube 英语精听听写：自动按句切分、单句循环播放，打出听到的内容逐词批改，听错的句子进错题本按间隔复习。 |
| 中文（繁體） | Listen Loop — YouTube 英語精聽聽寫 | YouTube 英語精聽聽寫：自動按句切分、單句循環播放，打出聽到的內容逐詞批改，聽錯的句子收進錯題本按間隔複習。 |

用户看到哪种语言的商店页，取决于他的 Chrome 界面语言。界面是英文的中国用户（比如你自己）看到的是英文版。

### 说明（Description）

后台右上角可以切换语言，三种语言各填一份。商店页不渲染 Markdown，换行会原样保留。

**中文（简体）**

```text
Listen Loop 把 YouTube 上的英文视频变成逐句精听、听写练习。不用另找材料，也不用来回拖进度条：打开喜欢的视频，点一下就能开始。

━━ 怎么练 ━━
1. 打开任意带英文字幕的 YouTube 视频（人工字幕、自动字幕都可以）
2. 点右侧面板里的「开始精听」，视频会自动按句切开
3. 每句自动循环播放（默认 3 遍），把听到的内容打出来
4. 按 Enter 逐词核对：绿色是对的，橙色是差一点，红色是错的，虚线是漏听的
5. 实在听不出来，可以逐级求助：提示首字母 → 看中文译文 → 看原文

━━ 主要功能 ━━
• 自动切句：按标点和停顿切分，太短的句子会并进相邻的句子；切得不准还可以 0.1 秒微调，或者合并、拆开
• 单句循环：循环次数（1～10 遍或无限）、每遍间隔、语速（0.5x～1.25x）都能调
• 宽松批改：大小写和标点不算错；don't 和 do not、gonna 和 going to、23 和 twenty-three、halftime 和 half time 都算对；uh、um 等语气词默认忽略
• 中文译文：用 Chrome 自带的本地翻译（需要 Chrome 138 或更新版本），免费，句子不会上传
• 错题本：听不出来的句子一键收藏，在第 1、3、7、15、30 天安排复习；复习时直接回到原视频的那一句，根据你的作答自动打分
• 易错词：自动统计你最常听错、漏听的单词
• 键盘操作：Enter 检查或进入下一句，Tab 重播，Alt+← / → 切换句子；打字时会屏蔽 YouTube 的快捷键，不会误触暂停或全屏
• 遮挡字幕：可以遮住画面里烧录的字幕，逼自己真正去听
• 跟随 YouTube 的深色模式，界面中英文自动切换

━━ 隐私 ━━
• 不用注册，没有账号
• 设置、练习进度和错题本都只存在你自己的浏览器里，可以导出备份
• 不调用任何大模型或付费接口，没有统计和广告代码
• 只有你主动点「反馈」时才会打开反馈表单，提交前可以看到并修改要发送的内容

━━ 适合谁 ━━
• 想练英语听力，准备雅思、托福、考研英语的同学
• 习惯在 YouTube 上看英文内容，但总觉得「听过就忘」「一快就听不清」的人
• 想用访谈、播客、公开课、体育节目等真实语料练耳朵的人

━━ 说明 ━━
• 只支持带英文字幕的视频
• Listen Loop 是独立开发的工具，与 YouTube 和 Google 没有任何关联
• 有问题或建议：在面板的设置里点「反馈问题 / 提建议」
```

**中文（繁體）**

```text
Listen Loop 把 YouTube 上的英文影片變成逐句精聽、聽寫練習。不用另外找教材，也不用來回拖進度條：打開喜歡的影片，點一下就能開始。

━━ 怎麼練 ━━
1. 打開任何附英文字幕的 YouTube 影片（人工字幕、自動字幕都可以）
2. 點右側面板裡的「开始精听」（開始精聽），影片會自動按句切開
3. 每句自動循環播放（預設 3 遍），把聽到的內容打出來
4. 按 Enter 逐詞核對：綠色是對的，橘色是差一點，紅色是錯的，虛線是漏聽的
5. 真的聽不出來，可以逐級求助：提示首字母 → 看中文譯文 → 看原文

━━ 主要功能 ━━
• 自動切句：依標點和停頓切分，太短的句子會併入相鄰的句子；切得不準還可以 0.1 秒微調，或者合併、拆開
• 單句循環：循環次數（1～10 遍或無限）、每遍間隔、播放速度（0.5x～1.25x）都能調整
• 寬鬆批改：大小寫和標點不算錯；don't 和 do not、gonna 和 going to、23 和 twenty-three、halftime 和 half time 都算對；uh、um 等語助詞預設忽略
• 中文譯文：使用 Chrome 內建的本機翻譯（需要 Chrome 138 或更新版本），免費，句子不會上傳；瀏覽器語言以繁體中文為優先時，會翻成繁體
• 錯題本：聽不出來的句子一鍵收藏，在第 1、3、7、15、30 天安排複習；複習時直接回到原影片的那一句，依你的作答自動評分
• 易錯單字：自動統計你最常聽錯、漏聽的單字
• 鍵盤操作：Enter 檢查或進入下一句，Tab 重播，Alt+← / → 切換句子；打字時會停用 YouTube 的快捷鍵，不會誤觸暫停或全螢幕
• 遮擋字幕：可以遮住畫面裡內嵌的字幕，逼自己真正去聽
• 跟隨 YouTube 的深色模式

━━ 隱私 ━━
• 不用註冊，沒有帳號
• 設定、練習進度和錯題本都只存在你自己的瀏覽器裡，可以匯出備份
• 不呼叫任何大型語言模型或付費 API，沒有統計和廣告程式碼
• 只有你主動點「反馈」（回饋）時才會開啟回饋表單，送出前可以看到並修改要傳送的內容

━━ 說明 ━━
• 只支援附英文字幕的影片
• 介面目前提供簡體中文和英文
• Listen Loop 是獨立開發的工具，與 YouTube 和 Google 沒有任何關聯
```

**English**

```text
Listen Loop turns YouTube videos into sentence-by-sentence dictation practice. No hunting for materials and no scrubbing the progress bar: open a video you like and start with one click.

HOW IT WORKS
1. Open any YouTube video with English captions (manual or auto-generated)
2. Click "Start practice" in the panel on the right; the video is split into sentences
3. Each sentence loops (3 times by default) while you type what you hear
4. Press Enter to check it word by word: green is right, orange is close, red is wrong, dashed is missed
5. Stuck? Get help step by step: first letters → Chinese translation → the answer

FEATURES
• Automatic sentence splitting by punctuation and pauses; very short sentences are joined to a neighbour. Slightly off? Nudge either end by 0.1 s, or join and split sentences
• Sentence loop: 1–10 loops or forever, a pause between loops, speed from 0.5x to 1.25x
• Forgiving checking: case and punctuation are ignored; don't = do not, gonna = going to, 23 = twenty-three, halftime = half time; fillers like uh and um are skipped
• Mistake notebook: save sentences you couldn't get and review them on day 1, 3, 7, 15 and 30. A review plays the sentence in the original video and grades itself from your answer
• The words you miss most, collected automatically
• Keyboard-first: Enter to check or go on, Tab to replay, Alt+← / → to move between sentences. YouTube's own shortcuts are blocked while you type, so you won't pause or go full screen by accident
• Cover burned-in subtitles so you really have to listen
• Follows YouTube's dark theme; English and Chinese interface

PRIVACY
• No sign-up, no account
• Settings, progress and your notebook stay in your browser; export a backup any time
• No AI services or paid APIs, no analytics, no ads. Translation runs on your device with Chrome's built-in translator (Chrome 138 or later)
• The feedback form opens only when you click "Send feedback", and you see everything before you submit

NOTES
• Works with videos that have English captions
• The translation hint is into Chinese for now
• Listen Loop is an independent project and is not affiliated with YouTube or Google
```

### 类别、语言、链接

| 字段 | 填什么 |
|---|---|
| 类别（Category） | 教育（Education） |
| 语言（Language） | 默认 English，另外添加「中文（简体）」和「中文（繁體）」 |
| 官方网址（Official URL） | 不填。这一项需要先在 Search Console 验证网站，以后有官网再加 |
| 首页网址（Homepage URL） | `https://github.com/rayjiu/listen-loop` |
| 支持网址（Support URL） | `https://kil5372lmm.feishu.cn/share/base/form/shrcnn19XwOWed9x9NWZ0C1Io6i` |
| 宣传视频（Promo video） | 选填。小红书的演示视频以后也传一份到 YouTube，再把链接填进来 |

### 图片

所有文件都在 `store/assets/` 里。后台按语言切换后，可以给每种语言上传各自的截图和宣传图。如果某个字段不支持按语言区分，就统一用中文版。

| 后台字段 | 尺寸 | 中文（简体、繁體共用） | English |
|---|---|---|---|
| 商店图标（Store icon） | 128×128 | `icon-128.png` | 同左 |
| 屏幕截图（Screenshots，1～5 张，按顺序上传） | 1280×800 | `zh-1.png` … `zh-5.png` | `en-1.png` … `en-5.png` |
| 小型宣传图块（Small promo tile） | 440×280 | `promo-small-zh.png` | `promo-small-en.png` |
| 顶部宣传图块（Marquee promo tile） | 1400×560 | `promo-marquee-zh.png` | `promo-marquee-en.png` |

五张截图的内容：

| # | 标题（中文） | 标题（English） | 画面 |
|---|---|---|---|
| 1 | 把 YouTube 变成英语精听课 | Turn YouTube into dictation practice | 练习中，正在输入 |
| 2 | 逐词批改，哪里没听出来一目了然 | See exactly what you missed | 检查结果：对、差一点、错、漏听 |
| 3 | 卡住了？三级提示帮你听懂 | Stuck? Hints, one step at a time | 首字母提示加中文译文 |
| 4 | 错题本：按遗忘曲线安排复习 | A mistake notebook that schedules reviews | 错题本页面 |
| 5 | 回到原视频复习，自动打分 | Review in the original video | 复习模式，作答后自动判定 |

截图里的视频来自美国国家公园管理局（NPS）的官方频道（Yellowstone、Grand Canyon）。这些是美国联邦政府的作品，属于公有领域，放进商店图里不涉及版权问题。

## 2. 隐私权（Privacy practices）

审核员读的是英文，这一页全部填英文。

### 单一用途说明（Single purpose）

```text
Listen Loop helps people practise English listening with dictation on YouTube. It splits the current video's English captions into sentences, loops one sentence at a time, checks what the user types word by word, and lets the user save sentences to a local notebook for spaced-repetition review.
```

### 权限理由（Permission justification）

**storage**

```text
Saves the user's settings, per-video progress and sentence-boundary adjustments, the mistake notebook and cached translations in chrome.storage.local, on the user's device only. Nothing is synced or sent anywhere.
```

**主机权限（Host permission）**：后台可能会问 `https://www.youtube.com/*`，这一项来自 content_scripts 的匹配规则。

```text
The extension's only purpose is dictation practice on YouTube videos, so its content scripts run on www.youtube.com and nowhere else. They add the practice panel next to the video, read the English caption track that the YouTube player loads (used to split sentences and check answers), and control the page's video element to loop sentences and change speed.
```

### 远程代码（Remote code）

选「否，我不使用远程代码」（No, I am not using remote code）。如果要求填写理由：

```text
All JavaScript is packaged in the extension. It loads no external scripts, uses no eval or new Function, and fetches no code. Translation uses Chrome's built-in on-device Translator API.
```

### 数据使用（Data usage）

建议**只勾选「网络浏览记录（Web history）」**，其他都不勾。

原因：用户点「反馈」时，表单的诊断信息里预填了当前视频 ID 和播放时间点。它们在打开表单的链接里，会到达飞书的服务器。这件事是用户主动触发的，但审核员读代码时能看到，如实申报最稳妥。

另一种做法：把视频 ID 从预填内容里去掉（我可以改，改一行代码），这里就可以一项都不勾，商店页会显示「开发者声明不会收集或使用你的数据」。代价是用户反馈「这个视频用不了」时，你得让他自己贴链接。

下面三条声明都勾选：

- I do not sell or transfer user data to third parties, outside of the approved use cases
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- I do not use or transfer user data to determine creditworthiness or for lending purposes

### 隐私权政策网址（Privacy policy URL）

```text
https://github.com/rayjiu/listen-loop/blob/main/PRIVACY.md
```

## 3. 分发（Distribution）

| 字段 | 建议 |
|---|---|
| 付款 | 免费 |
| 可见性 | 先选「不公开」（Unlisted）：只有拿到链接的人能安装，商店里搜不到。给朋友和小范围用户试几天，没问题再在后台改成「公开」（改可见性可能会再过一次审核） |
| 地区 | 所有地区 |

## 4. 给审核员的测试说明（Test instructions）

在「隐私权」或「测试说明」里填写：

```text
No account or login is needed.
1. Open https://www.youtube.com/watch?v=ekZLqE7XRU0 (any video with English captions works).
2. In the right column, click "Start practice" in the Listen Loop panel. The current sentence starts looping.
3. Type what you hear and press Enter to see word-by-word feedback. The buttons under the box show the first letters, a translation (Chrome 138+, on-device) or the answer.
4. Click ☆ to save the sentence to the notebook, then click the extension's toolbar icon to open the notebook page.
```

## 5. 注意事项

- **名称里的 YouTube：** 英文名用的是「for YouTube」这种写法，说明里也写了与 YouTube、Google 无关。如果审核以商标为由拒绝，把名称里的 YouTube 去掉，改成 `Listen Loop — English dictation practice`。
- **译文只翻成中文：** 英文版说明里已经写明。以后可以改成翻译到浏览器语言，Chrome 的翻译接口本来就支持。
- **国内用户：** 打开 Chrome 应用商店和 YouTube 都需要能访问外网，宣传时可以顺带说明。

## 6. 重新生成图片

```bash
python3 store/make_assets.py     # 读 store/raw/*.png，输出 store/assets/*.png
```

- `store/raw/` 里是在真实 YouTube 页面上截的原图（1280×800 视口，2 倍分辨率）。原图约 15MB，没有提交到 git，只保存在这台电脑上。
- 截图标题、副标题和宣传图的文字，都写在 `make_assets.py` 开头的 `SHOTS` 和 `TILES` 里。改完重新运行即可，排版模板也在这个文件里。
- 界面改版需要换图时，按原来的文件名重新截原图，再运行上面的命令。截图时把浏览器视口设成 1280×800，界面里不要出现个人信息。
