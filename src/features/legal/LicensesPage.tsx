import { isHttpUrl } from '@highpress/core/body'
import { LICENSES } from './licenses'
import './legal.css'
const needsSource = (license: string) => license.includes('MPL')

export function LicensesPage() {
  return (
    <main className="licenses">
      <a href="#/">← 홈으로</a>
      <h1>오픈소스 라이선스 고지</h1>
      <p className="muted">이 앱은 아래 오픈소스 라이브러리를 사용합니다. 각 라이브러리의 저작권은 해당 저작자에게 있습니다.</p>
      <table className="license-table">
        <thead>
          <tr>
            <th scope="col">라이브러리</th>
            <th scope="col">버전</th>
            <th scope="col">라이선스</th>
          </tr>
        </thead>
        <tbody>
          {LICENSES.map((l) => (
            <tr key={l.name}>
              <th scope="row">{l.name}</th>
              <td>{l.version}</td>
              <td>{l.license}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>라이선스 전문</h2>
      {LICENSES.map((l) => (
        <details key={l.name} className="license-text">
          <summary>
            {l.name} {l.version} ({l.license})
          </summary>
          {needsSource(l.license) && l.repository && (
            <p>
              소스 코드: {l.repository}
              {isHttpUrl(l.repository) && (
                <>
                  {' '}
                  (<a href={l.repository} target="_blank" rel="noopener noreferrer">링크 열기</a>)
                </>
              )}
            </p>
          )}
          <pre>{l.text || '라이선스 본문 파일이 패키지에 포함되어 있지 않습니다.'}</pre>
        </details>
      ))}
    </main>
  )
}
