import fs from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import { createInterface } from "node:readline";
import { URL } from "node:url";

class APITester {
  constructor() {
    this.rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    this.testCases = [];
    this.resultsDir = "./api-test-results";
  }

  async question(prompt) {
    return new Promise((resolve) => {
      this.rl.question(prompt, resolve);
    });
  }

  async collectAPIInfo() {
    console.log("\n=== REST API 테스터 ===");
    console.log(
      "API 요청 정보를 입력해주세요. 빈 값으로 두려면 Enter를 누르세요.\n"
    );

    const apiInfo = {};

    // 도메인 입력
    apiInfo.domain = await this.question(
      "도메인 (예: https://api.example.com): "
    );
    if (!apiInfo.domain) {
      console.log("도메인은 필수입니다!");
      return this.collectAPIInfo();
    }

    // 요청 경로
    apiInfo.path = (await this.question("요청 경로 (예: /users/123): ")) || "/";

    // HTTP 메서드
    const method = await this.question(
      "HTTP 메서드 (GET/POST/PUT/DELETE/PATCH) [GET]: "
    );
    apiInfo.method = method.toUpperCase() || "GET";

    // Query 파라미터
    apiInfo.queryParams = {};
    console.log("\n--- Query 파라미터 ---");
    console.log("형식: key=value 또는 빈 값으로 완료");

    while (true) {
      const param = await this.question("Query 파라미터: ");
      if (!param) break;

      const [key, value] = param.split("=");
      if (key && value) {
        apiInfo.queryParams[key.trim()] = value.trim();
        console.log(`추가됨: ${key.trim()}=${value.trim()}`);
      } else {
        console.log("올바른 형식: key=value");
      }
    }

    // 요청 헤더
    apiInfo.headers = {};
    console.log("\n--- 요청 헤더 ---");
    console.log("형식: Header-Name:Header-Value 또는 빈 값으로 완료");

    while (true) {
      const header = await this.question("헤더: ");
      if (!header) break;

      const [key, value] = header.split(":");
      if (key && value) {
        apiInfo.headers[key.trim()] = value.trim();
        console.log(`추가됨: ${key.trim()}: ${value.trim()}`);
      } else {
        console.log("올바른 형식: Header-Name:Header-Value");
      }
    }

    // 쿠키
    apiInfo.cookies = [];
    console.log("\n--- 쿠키 ---");
    console.log("형식: name=value 또는 빈 값으로 완료");

    while (true) {
      const cookie = await this.question("쿠키: ");
      if (!cookie) break;

      const [name, value] = cookie.split("=");
      if (name && value) {
        apiInfo.cookies.push(`${name.trim()}=${value.trim()}`);
        console.log(`추가됨: ${name.trim()}=${value.trim()}`);
      } else {
        console.log("올바른 형식: name=value");
      }
    }

    // 요청 바디 (POST, PUT, PATCH일 때만)
    if (["POST", "PUT", "PATCH"].includes(apiInfo.method)) {
      console.log("\n--- 요청 바디 ---");
      console.log("JSON 형태로 입력하거나 빈 값으로 스킵:");
      const bodyInput = await this.question("요청 바디: ");

      if (bodyInput) {
        try {
          apiInfo.body = JSON.parse(bodyInput);
        } catch (e) {
          console.log("JSON 파싱 실패, 문자열로 처리합니다.");
          apiInfo.body = bodyInput;
        }
      }
    }

    return apiInfo;
  }

  async executeRequest(apiInfo) {
    try {
      console.log("\n=== 요청 실행 중... ===");

      // URL 구성
      let fullUrl = apiInfo.domain + apiInfo.path;

      // Query 파라미터 추가
      if (Object.keys(apiInfo.queryParams).length > 0) {
        const params = new URLSearchParams(apiInfo.queryParams);
        fullUrl += "?" + params.toString();
      }

      const url = new URL(fullUrl);
      const isHttps = url.protocol === "https:";
      const httpModule = isHttps ? https : http;

      // 요청 옵션 설정
      const options = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method: apiInfo.method,
        headers: { ...apiInfo.headers },
      };

      // 쿠키 헤더 추가
      if (apiInfo.cookies.length > 0) {
        options.headers["Cookie"] = apiInfo.cookies.join("; ");
      }

      // Content-Type 자동 설정 (JSON 바디가 있을 때)
      if (apiInfo.body && typeof apiInfo.body === "object") {
        options.headers["Content-Type"] = "application/json";
      }

      // 요청 정보 출력
      console.log("요청 URL:", fullUrl);
      console.log("메서드:", apiInfo.method);
      console.log("헤더:", options.headers);
      if (apiInfo.body) {
        console.log(
          "바디:",
          typeof apiInfo.body === "object"
            ? JSON.stringify(apiInfo.body, null, 2)
            : apiInfo.body
        );
      }

      const result = await this.makeRequest(httpModule, options, apiInfo.body);

      console.log("\n=== 응답 결과 ===");
      console.log("상태 코드:", result.statusCode);
      console.log("응답 헤더:", result.headers);
      console.log("\n응답 바디:");
      console.log(result.body);

      // 결과 저장 여부 확인
      const saveResult = await this.question(
        "\n📁 이 요청과 응답을 JSON 파일로 저장하시겠습니까? (y/n): "
      );
      if (
        saveResult.toLowerCase() === "y" ||
        saveResult.toLowerCase() === "yes"
      ) {
        await this.saveTestResult(apiInfo, result, fullUrl);
      }

      return result;
    } catch (error) {
      console.error("\n❌ 요청 실행 중 오류 발생:", error.message);

      // 에러도 저장할지 확인
      const saveError = await this.question(
        "\n📁 이 에러 정보를 JSON 파일로 저장하시겠습니까? (y/n): "
      );
      if (
        saveError.toLowerCase() === "y" ||
        saveError.toLowerCase() === "yes"
      ) {
        await this.saveTestResult(
          apiInfo,
          { error: error.message, statusCode: null },
          fullUrl
        );
      }
    }
  }

  makeRequest(httpModule, options, body) {
    return new Promise((resolve, reject) => {
      const req = httpModule.request(options, (res) => {
        let data = "";

        res.on("data", (chunk) => {
          data += chunk;
        });

        res.on("end", () => {
          try {
            const parsedBody = JSON.parse(data);
            resolve({
              statusCode: res.statusCode,
              headers: res.headers,
              body: JSON.stringify(parsedBody, null, 2),
            });
          } catch (e) {
            resolve({
              statusCode: res.statusCode,
              headers: res.headers,
              body: data,
            });
          }
        });
      });

      req.on("error", (error) => {
        reject(error);
      });

      // 바디가 있으면 전송
      if (body) {
        const bodyData = typeof body === "object" ? JSON.stringify(body) : body;
        req.write(bodyData);
      }

      req.end();
    });
  }

  async ensureResultsDirectory() {
    try {
      await fs.access(this.resultsDir);
    } catch {
      await fs.mkdir(this.resultsDir, { recursive: true });
      console.log(`📁 결과 저장 폴더가 생성되었습니다: ${this.resultsDir}`);
    }
  }

  async saveTestResult(apiInfo, result, fullUrl) {
    try {
      await this.ensureResultsDirectory();

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const filename = `api-test-${timestamp}.json`;
      const filepath = path.join(this.resultsDir, filename);

      const testResult = {
        timestamp: new Date().toISOString(),
        request: {
          url: fullUrl,
          method: apiInfo.method,
          domain: apiInfo.domain,
          path: apiInfo.path,
          queryParams: apiInfo.queryParams,
          headers: apiInfo.headers,
          cookies: apiInfo.cookies,
          body: apiInfo.body || null,
        },
        response: {
          statusCode: result.statusCode,
          headers: result.headers,
          body: result.body,
          error: result.error || null,
        },
        duration: result.duration || null,
      };

      await fs.writeFile(filepath, JSON.stringify(testResult, null, 2), "utf8");
      console.log(`✅ 테스트 결과가 저장되었습니다: ${filepath}`);
    } catch (error) {
      console.error("❌ 파일 저장 중 오류 발생:", error.message);
    }
  }

  async showSavedResults() {
    try {
      await this.ensureResultsDirectory();
      const files = await fs.readdir(this.resultsDir);
      const jsonFiles = files.filter((file) => file.endsWith(".json"));

      if (jsonFiles.length === 0) {
        console.log("\n📂 저장된 결과 파일이 없습니다.");
        return;
      }

      console.log("\n=== 저장된 API 테스트 결과들 ===");

      // 최근 파일부터 보여주기
      jsonFiles.sort().reverse();

      for (let i = 0; i < Math.min(jsonFiles.length, 10); i++) {
        const file = jsonFiles[i];
        const filepath = path.join(this.resultsDir, file);

        try {
          const content = await fs.readFile(filepath, "utf8");
          const testResult = JSON.parse(content);

          console.log(`\n${i + 1}. ${file}`);
          console.log(`   시간: ${testResult.timestamp}`);
          console.log(
            `   요청: ${testResult.request.method} ${testResult.request.url}`
          );
          console.log(`   응답: ${testResult.response.statusCode || "ERROR"}`);
        } catch (e) {
          console.log(`\n${i + 1}. ${file} (파일 읽기 오류)`);
        }
      }

      if (jsonFiles.length > 10) {
        console.log(
          `\n... 그 외 ${jsonFiles.length - 10}개 파일이 더 있습니다.`
        );
      }

      // 특정 파일 상세 보기 옵션
      const viewDetail = await this.question(
        "\n특정 파일의 상세 내용을 보시겠습니까? 파일명 입력 (또는 Enter로 건너뛰기): "
      );
      if (viewDetail && jsonFiles.includes(viewDetail)) {
        await this.showDetailedResult(viewDetail);
      }
    } catch (error) {
      console.error("❌ 저장된 결과 조회 중 오류:", error.message);
    }
  }

  async showDetailedResult(filename) {
    try {
      const filepath = path.join(this.resultsDir, filename);
      const content = await fs.readFile(filepath, "utf8");
      const testResult = JSON.parse(content);

      console.log("\n=== 상세 테스트 결과 ===");
      console.log(JSON.stringify(testResult, null, 2));
    } catch (error) {
      console.error("❌ 파일 읽기 오류:", error.message);
    }
  }

  async showSummary() {
    if (this.testCases.length === 0) {
      console.log("\n저장된 테스트 케이스가 없습니다.");
      return;
    }

    console.log("\n=== 저장된 테스트 케이스들 ===");
    this.testCases.forEach((testCase, index) => {
      console.log(
        `\n${index + 1}. ${testCase.method} ${testCase.domain}${testCase.path}`
      );
      if (Object.keys(testCase.queryParams).length > 0) {
        console.log(`   Query: ${JSON.stringify(testCase.queryParams)}`);
      }
      if (Object.keys(testCase.headers).length > 0) {
        console.log(`   Headers: ${JSON.stringify(testCase.headers)}`);
      }
    });
  }

  async run() {
    console.log("🚀 REST API 테스터에 오신 것을 환영합니다!");

    while (true) {
      console.log("\n" + "=".repeat(50));
      console.log("1. 새 API 요청 테스트");
      console.log("2. 저장된 테스트 케이스 보기");
      console.log("3. 종료");

      const choice = await this.question("\n선택하세요 (1-3): ");

      switch (choice) {
        case "1":
          const apiInfo = await this.collectAPIInfo();
          if (apiInfo) {
            await this.executeRequest(apiInfo);

            const save = await this.question(
              "\n이 테스트 케이스를 저장하시겠습니까? (y/n): "
            );
            if (save.toLowerCase() === "y" || save.toLowerCase() === "yes") {
              this.testCases.push(apiInfo);
              console.log("✅ 테스트 케이스가 저장되었습니다.");
            }
          }
          break;

        case "2":
          await this.showSummary();
          break;

        case "3":
          console.log("\n👋 API 테스터를 종료합니다.");
          this.rl.close();
          return;

        default:
          console.log("올바른 번호를 선택해주세요.");
      }

      await this.question("\nEnter를 눌러 계속...");
    }
  }
}

// 애플리케이션 시작
const tester = new APITester();
tester.run().catch(console.error);

// 프로그램 종료 처리
process.on("SIGINT", () => {
  console.log("\n\n👋 프로그램을 종료합니다.");
  process.exit(0);
});
