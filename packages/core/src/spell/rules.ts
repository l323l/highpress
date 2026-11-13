// 규칙 기반 맞춤법 검사. 자주 틀리는 표현을 목록으로 갖고 기기 안에서만 검사한다 (서버로 글을 보내지 않는다).
// 목록에 없는 오류와 문맥을 봐야 아는 오류(로서/로써, 안/않의 대부분, 띄어쓰기 전반)는 잡지 못한다.
// 틀렸다고 확신할 수 있는 것만 넣는다: 맞는 글을 틀렸다고 하는 편이 놓치는 것보다 나쁘다.

export interface SpellIssue {
  // 글자 위치 (끝은 포함하지 않는다)
  from: number
  to: number
  wrong: string
  right: string
  why: string
}

interface Rule {
  find: RegExp
  // 고칠 말. 함수가 null을 주면 틀린 것이 아니다.
  fix: string | ((match: RegExpExecArray) => string | null)
  why: string
}

// 받침이 ㄹ인 글자인지 (할, 갈, 볼 …)
function endsWithRieul(char: string): boolean {
  const code = char.charCodeAt(0) - 0xac00
  return code >= 0 && code <= 11171 && code % 28 === 8
}

const word = (wrong: string, right: string, why: string): Rule => ({ find: new RegExp(wrong, 'g'), fix: right, why })
const LOANWORD = '외래어 표기법에 따른 표기입니다.'
const NEGATION = '부정은 "안"으로 쓰고 띄어 씁니다.'

const RULES: Rule[] = [
  // ── 되/돼 ──
  word('됬', '됐', '"됬"이라는 글자는 쓰지 않습니다. "되었"의 준말은 "됐"입니다.'),
  word('되요', '돼요', '"되어요"의 준말은 "돼요"입니다.'),
  word('되서', '돼서', '"되어서"의 준말은 "돼서"입니다.'),
  word('되야', '돼야', '"되어야"의 준말은 "돼야"입니다.'),
  word('됀', '된', '"됀"이라는 글자는 쓰지 않습니다.'),
  word('않되', '안 되', NEGATION),
  word('않돼', '안 돼', NEGATION),
  word('않된', '안 된', NEGATION),
  word('않하', '안 하', NEGATION),
  word('않했', '안 했', NEGATION),
  word('뵈요', '봬요', '"뵈어요"의 준말은 "봬요"입니다.'),

  // ── 자주 틀리는 낱말 ──
  word('몇 ?일', '며칠', '"몇 일"이 아니라 "며칠"로 씁니다.'),
  word('오랫만', '오랜만', '"오래간만"의 준말은 "오랜만"입니다.'),
  word('오랜동안', '오랫동안', '"오랫동안"으로 씁니다.'),
  word('금새', '금세', '"금시에"의 준말은 "금세"입니다.'),
  word('어의없', '어이없', '"어이없다"로 씁니다.'),
  word('어의가 없', '어이가 없', '"어이가 없다"로 씁니다.'),
  word('웬지', '왠지', '"왜인지"의 준말은 "왠지"입니다.'),
  word('왠일', '웬일', '"웬일"로 씁니다.'),
  word('왠만', '웬만', '"웬만하다"로 씁니다.'),
  word('일일히', '일일이', '"일일이"로 씁니다.'),
  word('틈틈히', '틈틈이', '"틈틈이"로 씁니다.'),
  word('곰곰히', '곰곰이', '"곰곰이"로 씁니다.'),
  word('깨끗히', '깨끗이', '"깨끗이"로 씁니다.'),
  word('번번히', '번번이', '"번번이"로 씁니다.'),
  word('역활', '역할', '"역할"로 씁니다.'),
  word('희안', '희한', '"희한하다"로 씁니다.'),
  word('댓가', '대가', '"대가"로 씁니다 (사이시옷을 넣지 않습니다).'),
  word('갯수', '개수', '"개수"로 씁니다 (사이시옷을 넣지 않습니다).'),
  word('촛점', '초점', '"초점"으로 씁니다 (사이시옷을 넣지 않습니다).'),
  word('뒷처리', '뒤처리', '"뒤처리"로 씁니다.'),
  word('어떻해', '어떡해', '"어떻게 해"의 준말은 "어떡해"입니다.'),
  word('가르키', '가리키', '방향·대상을 짚는 말은 "가리키다"입니다.'),
  word('건들이', '건드리', '"건드리다"로 씁니다.'),
  word('들어났', '드러났', '겉으로 나타나는 것은 "드러나다"입니다.'),
  word('단언컨데', '단언컨대', '"-건대"로 씁니다.'),
  word('요컨데', '요컨대', '"요컨대"로 씁니다.'),
  word('그리고 나서', '그러고 나서', '"그러고 나서"로 씁니다.'),
  word('거에요', '거예요', '"거예요"로 씁니다.'),
  word('설레임', '설렘', '"설레다"의 명사형은 "설렘"입니다.'),
  word('내노라', '내로라', '"내로라하다"로 씁니다.'),
  word('뒤쳐지', '뒤처지', '뒤로 밀리는 것은 "뒤처지다"입니다.'),
  word('뒤쳐졌', '뒤처졌', '뒤로 밀리는 것은 "뒤처지다"입니다.'),
  word('치뤘', '치렀', '"치르다"의 과거형은 "치렀다"입니다.'),
  word('치뤄', '치러', '"치르다"는 "치러"로 활용합니다.'),
  word('잠궜', '잠갔', '"잠그다"의 과거형은 "잠갔다"입니다.'),

  // ── -ㄹ게 / -ㄹ걸 ──
  {
    find: /([가-힣])께(요)?(?![가-힣])/g,
    fix: (match) => (endsWithRieul(match[1]) ? `${match[1]}게${match[2] ?? ''}` : null),
    why: '약속하는 말은 "-ㄹ게"로 씁니다.',
  },
  {
    find: /([가-힣])껄(?![가-힣])/g,
    // "껄껄"은 웃음소리다.
    fix: (match) => (match[1] !== '껄' && endsWithRieul(match[1]) ? `${match[1]}걸` : null),
    why: '"-ㄹ걸"로 씁니다.',
  },

  // ── 띄어쓰기 (확실한 것만) ──
  {
    // "수없이"는 한 낱말이라 건드리지 않는다.
    find: /([가-힣]) ?수(있|없)(?!이)/g,
    fix: (match) => (endsWithRieul(match[1]) ? `${match[1]} 수 ${match[2]}` : null),
    why: '의존 명사 "수"는 앞뒤를 띄어 씁니다.',
  },
  word('것같', '것 같', '"것 같다"는 띄어 씁니다.'),
  word('뿐만아니라', '뿐만 아니라', '"뿐만 아니라"는 띄어 씁니다.'),

  // ── 외래어 표기 (축구 글에 자주 나오는 것) ──
  word('패널티', '페널티', LOANWORD),
  word('세레머니', '세리머니', LOANWORD),
  word('쓰루 ?패스', '스루패스', LOANWORD),
  word('챔피온', '챔피언', LOANWORD),
  word('리더쉽', '리더십', LOANWORD),
  word('멤버쉽', '멤버십', LOANWORD),
  word('파트너쉽', '파트너십', LOANWORD),
  word('메세지', '메시지', LOANWORD),
  word('스케쥴', '스케줄', LOANWORD),
  word('타겟', '타깃', LOANWORD),
  word('컨셉(?!트)', '콘셉트', LOANWORD),
  word('화이팅', '파이팅', LOANWORD),
  word('넌센스', '난센스', LOANWORD),
  word('플랜카드', '플래카드', LOANWORD),
  word('컨텐츠', '콘텐츠', LOANWORD),
  word('리버플', '리버풀', '구단 이름은 "리버풀"로 씁니다.'),
  word('토트넘 핫스퍼', '토트넘 홋스퍼', '구단 이름은 "토트넘 홋스퍼"로 씁니다.'),

  // ── 공백과 문장 부호 ──
  { find: /(\S) {2,}(?=\S)/g, fix: (match) => `${match[1]} `, why: '띄어쓰기는 한 칸만 씁니다.' },
  { find: /([가-힣a-zA-Z0-9]) +([,.!?])(?![.\d])/g, fix: (match) => `${match[1]}${match[2]}`, why: '문장 부호는 앞말에 붙여 씁니다.' },
]

export const RULE_COUNT = RULES.length

// 글 한 덩어리를 검사한다. 겹치는 곳은 앞에서 시작하는 것 하나만 남긴다.
export function checkText(text: string): SpellIssue[] {
  const found: SpellIssue[] = []
  for (const rule of RULES) {
    rule.find.lastIndex = 0
    for (let match = rule.find.exec(text); match; match = rule.find.exec(text)) {
      if (match[0].length === 0) {
        rule.find.lastIndex += 1
        continue
      }
      const right = typeof rule.fix === 'string' ? rule.fix : rule.fix(match)
      if (right === null || right === match[0]) continue
      found.push({ from: match.index, to: match.index + match[0].length, wrong: match[0], right, why: rule.why })
    }
  }
  found.sort((a, b) => a.from - b.from || b.to - a.to)
  const issues: SpellIssue[] = []
  for (const issue of found) {
    const last = issues[issues.length - 1]
    if (!last || issue.from >= last.to) issues.push(issue)
  }
  return issues
}
