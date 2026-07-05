# 天天的足迹 Supabase 云同步配置

目标：所有访问者都能看到彼此的足迹和照片，但只能修改/删除自己创建的记录。

## 1. 创建 Supabase 项目

1. 打开 https://supabase.com 并登录。
2. New project，创建一个免费项目。
3. 进入 Project Settings -> API，复制：
   - Project URL
   - anon public key

## 2. 开启匿名登录

进入 Authentication -> Sign In / Providers，开启 Anonymous Sign-Ins。

## 3. 初始化数据库和存储权限

进入 SQL Editor，新建 query，粘贴并运行 `supabase-setup.sql` 的全部内容。

这个脚本会创建：

- `footprints`：每个人的城市足迹、日期、备注
- `photos`：照片记录和公开访问地址
- `travel-photos`：照片存储桶
- RLS 权限：
  - 所有人可读足迹和照片
  - 只能新增自己的记录
  - 只能修改/删除自己的记录
  - 只能上传/删除自己用户目录下的照片

## 4. 填写前端配置

打开 `supabase-config.js`，填入：

```js
window.TIANTIAN_SUPABASE = {
  url: "https://你的项目.supabase.co",
  anonKey: "你的 anon public key",
};
```

保存后刷新 `https://butterfly-elections-priority-robust.trycloudflare.com`。

如果成功，地点卡片会显示：

`云同步已开启，大家可见，只能编辑自己的记录`

## 5. 使用方式

- 每个访问者会自动匿名登录。
- 每个人可以改自己的昵称、点亮城市、写备注、传照片。
- 地图和照片墙会展示所有人的公共记录。
- 删除照片、清空记录只会影响自己的内容。

## 注意

当前 Cloudflare 临时隧道地址变更后，同一个浏览器会被视为一个新的站点来源，匿名会话可能不能沿用。长期使用建议部署到 GitHub Pages / Netlify / Vercel，并使用固定域名。
