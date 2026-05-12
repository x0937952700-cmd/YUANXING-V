-- V168 倉庫圖穩定修復
-- No schema change required.
-- This migration marker documents that warehouse stability changes are in the main loaded JS/app static version only:
-- 1. keep yx_cache/yx_core/service-worker API no-cache behavior unchanged
-- 2. coalesce same-cell autosave without setInterval/MutationObserver
-- 3. guard same-cell duplicate save taps without adding another renderer
SELECT 1;
