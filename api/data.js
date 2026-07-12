/* Vercel サーバーレス関数：学習データの Vercel Blob 保存・読込
   - 1ユーザー分の全データ（エッセイ・進捗・テーマ）を1つの JSON Blob に保存する
   - Blob のパスは APP_KEYWORD から導出した秘匿ハッシュを含み、URL の推測を防ぐ
   環境変数:
     APP_KEYWORD            … 合言葉（認証・パス導出に使用、必須）
     BLOB_READ_WRITE_TOKEN  … Vercel Blob ストアのトークン（Storage 連携で自動設定） */

const crypto = require('crypto');
const { put, get } = require('@vercel/blob');

const MAX_BYTES = 4 * 1024 * 1024; // 保存データの上限 4MB

function keywordMatches(given, expected) {
  const a = Buffer.from(String(given));
  const b = Buffer.from(String(expected));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/* 合言葉から導出する Blob パス（合言葉を知らない限り URL を推測できない） */
function dataPath() {
  const h = crypto.createHash('sha256')
    .update('essay-trainer-data:' + process.env.APP_KEYWORD)
    .digest('hex').slice(0, 32);
  return `essay-trainer/${h}.json`;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }
  const { keyword, op, data } = req.body || {};

  const expected = process.env.APP_KEYWORD;
  if (!expected) {
    return res.status(500).json({ error: 'サーバーに APP_KEYWORD が設定されていません' });
  }
  if (!keywordMatches(keyword || '', expected)) {
    return res.status(401).json({ error: 'キーワードが正しくありません' });
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return res.status(501).json({ error: 'BLOB_NOT_CONFIGURED' });
  }

  try {
    if (op === 'load') {
      let result;
      try {
        // 認証付きで直接読み出す（公開URLを介さない）。useCache:false で常に最新を取得
        result = await get(dataPath(), { access: 'private', useCache: false });
      } catch (e) {
        if (isNotFound(e)) return res.status(200).json({ data: null });
        throw e;
      }
      if (!result || result.statusCode !== 200) return res.status(200).json({ data: null });
      const parsed = await new Response(result.stream).json();
      return res.status(200).json({ data: parsed, updatedAt: result.blob && result.blob.uploadedAt });
    }

    if (op === 'save') {
      if (!data || typeof data !== 'object') {
        return res.status(400).json({ error: 'data が不正です' });
      }
      const json = JSON.stringify(data);
      if (json.length > MAX_BYTES) {
        return res.status(413).json({ error: 'データが大きすぎます（4MB上限）' });
      }
      await put(dataPath(), json, {
        access: 'private',
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: 'application/json',
      });
      return res.status(200).json({ ok: true, savedAt: Date.now() });
    }

    return res.status(400).json({ error: 'op が不正です' });
  } catch (e) {
    return res.status(502).json({ error: 'Blob 操作に失敗しました: ' + e.message });
  }
};

function isNotFound(e) {
  return e && (e.name === 'BlobNotFoundError' || /not.?found/i.test(e.message || ''));
}
