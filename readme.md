## 실행 방법

1. 루트 경로 ~/.zshrc나 ~/.bashrc 파일에 claude code sdk에서 사용할 수 있도록 api key를 환경변수로 만들어준다.

2. 스크립트 저장 및 실행 권한 부여

```bash
# generate-types.sh로 저장 후
chmod +x api-type-generator.sh
```

3. 실행

```bash
./generate-types.sh
```

### Trouble Shooting

1. claude code cli에는 프롬프트를 무조건 대화형으로만 넣어야하고, sh 단에서 넣어줄 수는 없다. 따라서 프로그래밍 방식의 sdk를 사용한다.
2. claude code의 토큰이 소진되면 에러가 발생함.
