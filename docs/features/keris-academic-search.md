# KERIS/RISS 학술자료 검색

`keris-academic-search`는 RISS 검색 Open API(`https://www.riss.kr/openApi`)의 XML 메타데이터를 조회하는 stdlib Python helper다. RISS 검색 API는 기관/대학 전용 인증키를 요구하므로 이 스킬은 `k-skill-proxy`를 사용하지 않고 사용자 본인의 RISS 키로 상류를 직접 호출한다.

```bash
python3 keris-academic-search/scripts/keris_academic.py search --keyword '인공지능 교육'
python3 keris-academic-search/scripts/keris_academic.py search --title '대학도서관' --resource-type B --json
```

`keyword`, `title`, `author`, `subject`, `publisher` 중 하나 이상과 `resourceType=ALL|T|A|D|B`, `page`, `pageSize(1~100)`를 받는다. `ALL`은 공식 `T/A/O/U/F/S`, `A`는 `A/O`, `D`는 국내 학술논문 `A`, `B`는 단행본 `U`로 매핑한다. 여러 type을 합치는 `ALL`/`A`는 첫 페이지 결과를 round-robin으로 합치며 upstream을 type 수만큼 호출한다. 후속 페이지는 단일 type을 선택해야 한다.

## RISS API 키 발급

RISS 검색 Open API 키는 **공익 목적의 비영리 기관/대학에만** 무료로 발급된다(향후 민간 확대 예정). `DATA_GO_KR_API_KEY`와는 완전히 별개의 키다.

1. RISS(<https://www.riss.kr>)에 기관 소속으로 회원가입/로그인
2. RISS API 센터(<https://www.riss.kr/apicenter/apiMain.do>) → **RISS 검색 API** → 이용신청(<https://riss.kr/openAPI/OpenApiRegisterFinal.do>)
3. KERIS 담당자 심사·승인 후 인증키(`key`) 발급
4. 발급받은 키를 `KSKILL_RISS_API_KEY`(호환 `RISS_API_KEY`) 환경변수 또는 `~/.config/k-skill/secrets.env`에 설정

키가 없으면 스킬은 실행을 중단하고 발급 안내를 출력한다. `--dry-run`은 키 없이도 호출 URL을 확인할 수 있으며 키를 `REDACTED`로 표시한다.

결과는 제목, 저자, 발행처/학술지, 발행연도, RISS 링크, 원문 유무와 무료/유료·기관권한 가능 표시를 요약한다. RISS 링크의 실제 원문 접근은 기관 구독과 자료별 권한에 따라 달라지며 다운로드·로그인·결제는 자동화하지 않는다.

공공데이터포털 `15071949`는 관련 정적 종합목록/카탈로그 데이터이며 논문 검색 fallback이 아니다. 빈 결과는 정상 빈 목록, 키 오류·쿼터·상류 장애·XML 파싱 오류는 각각 typed failure로 반환한다.
