## 실행 방법

1. 루트 경로 ~/.zshrc나 ~/.bashrc 파일에 claude code sdk에서 사용할 수 있도록 api key를 환경변수로 만들어준다.

``` bash
# claude code sdk
export ANTHROPIC_API_KEY="YOUR_CLAUDE_CODE_API_KEY"
```

2. 의존성 설치

``` bash
npm install
```

3. 스크립트 저장 및 실행 권한 부여

```bash
chmod +x run-api-and-generate.sh
```

4. 실행

```bash
./run-api-and-generate.sh
```

### How to use
1. 요청, 응답에 대한 type을 만들 api를 정의해야한다. shell script를 실행하면 restAPI의 도메인, 엔드포인트, query parameter, header, cookie 관련 정보를 물어본다. 알맞게 입력한다.
2. 1에서 모두 입력했다면 api call을 진행하고 이를 json 파일로 저장한다. `테스트 케이스 저장`은 신경쓰지 않아도 된다.
3. shell script의 다음 순서인 타입 분석도 저장한 json 파일을 기반으로 진행한다.

### Trouble Shooting

1. claude code cli에는 프롬프트를 무조건 대화형으로만 넣어야하고, sh 단에서 넣어줄 수는 없다. 따라서 프로그래밍 방식의 sdk를 사용한다.
2. claude code의 토큰이 소진되면 에러가 발생함.
