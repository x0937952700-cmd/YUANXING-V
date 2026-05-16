# 沅興木業 scripts 執行方式

部署前：

```bash
python scripts/run_all_audits.py
```

部署後收集診斷：

```bash
python scripts/postdeploy_evidence_collect.py https://你的-render網址 --username 帳號 --password 密碼 --strict-version
```

V517 原則：scripts 保留分檔，外層只用主入口，避免全部合成一支超大檔造成互相影響。
