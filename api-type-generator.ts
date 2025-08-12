// api-type-generator.ts
import { query } from "@anthropic-ai/claude-code";
import fs from "fs/promises";
import path from "path";

class APITypeGenerator {
  private apiResultsDir = "./api-test-results";
  private typesDir = "./types";

  // API 경로를 camelCase로 변환
  private pathToCamelCase(apiPath: string): string {
    return apiPath
      .split("/")
      .filter((segment) => segment.length > 0)
      .map((segment, index) => {
        // 하이픈이나 언더스코어로 분리된 단어들 처리
        const words = segment.split(/[-_]/);

        return words
          .map((word, wordIndex) => {
            // 첫 번째 세그먼트의 첫 번째 단어는 소문자로
            if (index === 0 && wordIndex === 0) {
              return word.toLowerCase();
            }
            // 나머지는 첫 글자 대문자 (PascalCase)
            return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
          })
          .join("");
      })
      .join("");
  }

  // TypeScript 파일명 생성
  private generateFileName(camelCaseName: string): string {
    const pascalCase =
      camelCaseName.charAt(0).toUpperCase() + camelCaseName.slice(1);
    return `${pascalCase}.ts`;
  }

  // types 디렉터리 생성 보장
  private async ensureTypesDir() {
    await fs.mkdir(this.typesDir, { recursive: true });
  }

  // Claude 결과에서 TypeScript 코드 추출 (개선된 버전)
  private extractCodeFromResult(result: string): string {
    // 방법 1: 코드 블록이 있는 경우 추출
    const fenceRegex = /```(?:typescript|ts)?\n?([\s\S]*?)```/gi;
    const matches = result.match(fenceRegex);

    if (matches && matches.length > 0) {
      // 첫 번째 코드 블록 내용 추출
      const codeMatch = matches[0].match(
        /```(?:typescript|ts)?\n?([\s\S]*?)```/i
      );
      if (codeMatch && codeMatch[1]) {
        return codeMatch[1].trim();
      }
    }

    // 방법 2: 코드 블록이 없으면 전체 결과를 코드로 간주
    let cleanResult = result.trim();

    // 일반적인 설명 문구들 제거
    const descriptionsToRemove = [
      /^.*파일을 생성했습니다[.\s]*/i,
      /^.*다음과 같은.*타입을 정의했습니다[:\s]*/i,
      /^.*TypeScript 타입.*[:\s]*/i,
      /^\d+\.\s*\*\*.*\*\*:.*$/gm, // 1. **타입명**: 설명 형태 제거
      /^모든.*정확하게.*$/gm, // 마지막 요약 문장 제거
    ];

    descriptionsToRemove.forEach((pattern) => {
      cleanResult = cleanResult.replace(pattern, "");
    });

    // 방법 3: TypeScript 코드 패턴 확인
    if (
      cleanResult.includes("export interface") ||
      cleanResult.includes("export type") ||
      cleanResult.includes("interface ")
    ) {
      return cleanResult.trim();
    }

    // 방법 4: 실패시 기본 템플릿 생성
    console.warn("⚠️ 코드 추출 실패, 기본 템플릿 생성");
    return this.generateFallbackTemplate(result);
  }

  // 코드 추출 실패시 기본 템플릿 생성
  private generateFallbackTemplate(originalResult: string): string {
    return `/**
 * TypeScript 타입 생성 실패
 * 원본 응답: ${originalResult.substring(0, 100)}...
 */

// 기본 요청 타입
export interface ApiRequest {
  method: string;
  path: string;
  queryParams?: Record<string, any>;
  headers?: Record<string, string>;
  body?: any;
}

// 기본 응답 타입  
export interface ApiResponse {
  [key: string]: any;
}

// 기본 API 함수 타입
export type API = (request: ApiRequest) => Promise<ApiResponse>;
`;
  }

  // 타입 생성 프롬프트 생성 (간결하고 직접적으로)
  private createTypeGenerationPrompt(
    apiData: any,
    camelCaseName: string,
    fileName: string
  ): string {
    const request = apiData.request;
    const response = apiData.response;
    const pascalName =
      camelCaseName.charAt(0).toUpperCase() + camelCaseName.slice(1);

    return `API 경로: ${request.method} ${request.path}

요청 데이터:
${JSON.stringify(request, null, 2)}

응답 데이터:
${JSON.stringify(response, null, 2)}

다음 TypeScript 타입들을 생성하세요:

1. ${pascalName}Request - 요청 타입
2. ${pascalName}Response - response.body JSON을 정확히 분석한 응답 타입
3. ${pascalName}API - API 함수 타입

response.body는 JSON 문자열이므로 파싱해서 실제 구조를 타입으로 변환하세요.
중첩 객체, 배열, 모든 속성을 정확히 타입으로 정의하세요.

지금 TypeScript 코드만 출력하세요:`;
  }

  // 단일 API 결과 처리
  async processAPIResult(filePath: string) {
    try {
      console.log(`🔍 분석 중: ${path.basename(filePath)}`);

      // JSON 파일 읽기
      const fileContent = await fs.readFile(filePath, "utf8");
      const apiData = JSON.parse(fileContent);

      // camelCase 변환
      const camelCaseName = this.pathToCamelCase(apiData.request.path);
      const fileName = this.generateFileName(camelCaseName);

      console.log(`📝 생성할 파일: ${fileName}`);
      console.log(`🔤 camelCase: ${camelCaseName}`);

      // Claude에게 타입 생성 요청
      const prompt = this.createTypeGenerationPrompt(
        apiData,
        camelCaseName,
        fileName
      );

      console.log(`🤖 Claude 에이전트 실행 중... (maxTurns: 10)`);

      let finalResult: string | null = null;
      for await (const message of query({
        prompt: prompt,
        options: {
          customSystemPrompt: `당신은 TypeScript 코드 생성 전문 도구입니다. 
          
CRITICAL RULES:
1. 오직 TypeScript 코드만 출력하세요
2. 설명, 주석, 마크다운은 절대 포함하지 마세요
3. \`\`\`typescript나 \`\`\` 코드블록 마커도 사용하지 마세요
4. 순수한 TypeScript 코드만 반환하세요
5. 어떠한 추가 텍스트나 설명도 포함하지 마세요

INPUT: API 데이터
OUTPUT: 오직 TypeScript 타입 정의 코드만`,
          maxTurns: 10,
        },
      })) {
        if (message.type === "result" && message.subtype === "success") {
          finalResult = message.result;
          console.log(`🤖 Claude 응답 수신 (${message.result.length} chars)`);
        }
      }

      if (!finalResult) {
        throw new Error("Claude 결과를 받지 못했습니다.");
      }

      // 코드 추출 후 파일 저장
      const code = this.extractCodeFromResult(finalResult);

      // 추출된 코드 미리보기 (디버깅용)
      console.log(`📄 추출된 코드 미리보기 (처음 200자):`);
      console.log(code.substring(0, 200) + (code.length > 200 ? "..." : ""));

      await this.ensureTypesDir();
      const fullPath = path.join(this.typesDir, fileName);
      await fs.writeFile(fullPath, code, "utf8");

      console.log(`✅ ${fileName} 파일 생성 완료 (${code.length} bytes)`);
      console.log(`📍 파일 위치: ${fullPath}`);

      return { fileName, camelCaseName, success: true };
    } catch (error) {
      console.error(`❌ ${path.basename(filePath)} 처리 오류:`, error);
      return { fileName: null, success: false, error: error.message };
    }
  }

  // 인덱스 파일 생성
  async generateIndexFile(successfulResults: any[]) {
    const exports = successfulResults
      .map((result) => {
        const baseName = result.fileName.replace(".ts", "");
        const pascalName =
          result.camelCaseName.charAt(0).toUpperCase() +
          result.camelCaseName.slice(1);
        return `export * from './${baseName}';
export type { ${pascalName}Request, ${pascalName}Response, ${pascalName}API } from './${baseName}';`;
      })
      .join("\n\n");

    // 간결한 프롬프트로 수정
    const indexPrompt = `다음 TypeScript 코드를 출력하세요:

/**
 * API 타입 정의 통합 Export
 * 자동 생성: ${new Date().toISOString()}
 */

${exports}

// 공통 타입들
export interface ApiError {
  message: string;
  code?: string;
  statusCode?: number;
}

export interface ApiResponse<T> {
  data: T;
  error?: ApiError;
  timestamp: string;
}`;

    console.log("\n📦 통합 인덱스 파일 생성 중...");

    let indexResult: string | null = null;
    for await (const message of query({
      prompt: indexPrompt,
      options: {
        customSystemPrompt:
          "오직 TypeScript 코드만 출력하세요. 설명이나 마크다운은 포함하지 마세요.",
        maxTurns: 5,
      },
    })) {
      if (message.type === "result" && message.subtype === "success") {
        indexResult = message.result;
        break;
      }
    }

    if (indexResult) {
      const indexCode = this.extractCodeFromResult(indexResult);
      await this.ensureTypesDir();
      await fs.writeFile(
        path.join(this.typesDir, "index.ts"),
        indexCode,
        "utf8"
      );
      console.log("✅ types/index.ts 생성 완료");
    } else {
      console.log("❌ 인덱스 파일 생성 실패");
    }
  }

  // 메인 실행 함수
  async run() {
    try {
      console.log("🚀 API 타입 생성기 시작\n");

      // JSON 파일 목록 가져오기
      const files = await fs.readdir(this.apiResultsDir);
      const jsonFiles = files.filter((file) => file.endsWith(".json"));

      if (jsonFiles.length === 0) {
        console.log("❌ api-test-results 디렉터리에 JSON 파일이 없습니다.");
        return;
      }

      console.log(`📊 발견된 API 테스트 파일: ${jsonFiles.length}개\n`);

      const results: (
        | {
            fileName: string;
            camelCaseName: string;
            success: boolean;
            error?: undefined;
          }
        | {
            fileName: null;
            success: boolean;
            error: any;
            camelCaseName?: undefined;
          }
      )[] = [];

      // 각 JSON 파일 순차 처리
      for (const file of jsonFiles) {
        const filePath = path.join(this.apiResultsDir, file);
        const result = await this.processAPIResult(filePath);
        results.push(result);

        // 요청 간 1초 대기 (안정성)
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      // 결과 요약
      const successful = results.filter((r) => r.success);
      const failed = results.filter((r) => !r.success);

      console.log("\n📋 작업 완료 요약:");
      console.log(`✅ 성공: ${successful.length}개`);
      console.log(`❌ 실패: ${failed.length}개`);

      // 성공한 결과들로 인덱스 파일 생성
      if (successful.length > 0) {
        await this.generateIndexFile(successful);
      }

      console.log("\n🎉 모든 작업이 완료되었습니다!");
      console.log(`📁 생성된 파일들: types/ 디렉터리를 확인하세요`);
    } catch (error) {
      console.error("❌ 실행 중 오류:", error);
    }
  }
}

// 실행
const generator = new APITypeGenerator();
generator.run();
