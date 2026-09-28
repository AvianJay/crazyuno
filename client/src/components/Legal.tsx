import { useEffect, useState } from 'react';
import { CloseIcon, DocIcon, ShieldIcon } from './icons';

type Page = 'privacy' | 'terms';

/**
 * 大廳底下的「隱私權」「服務條款」。
 * 在遊戲裡直接開一個視窗載入頁面（同一個網址底下，Discord 裡也打得開），不用跳出去。
 */
export function LegalLinks() {
  const [page, setPage] = useState<Page | null>(null);

  useEffect(() => {
    if (!page) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setPage(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [page]);

  return (
    <>
      <div className="legal-links">
        <button onClick={() => setPage('privacy')}>
          <ShieldIcon /> 隱私權
        </button>
        <button onClick={() => setPage('terms')}>
          <DocIcon /> 服務條款
        </button>
      </div>
      {page && (
        <div className="legal-modal" onClick={() => setPage(null)}>
          <div className="legal-frame" onClick={(e) => e.stopPropagation()}>
            <iframe src={`/${page}/?embed=1`} title={page === 'privacy' ? '隱私權政策' : '服務條款'} />
            <button className="legal-close" onClick={() => setPage(null)} aria-label="關閉">
              <CloseIcon />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
