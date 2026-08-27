# Testing Strategy and Implementation

## Current Testing Infrastructure

### Test Framework
- **Vitest** - Modern, ESM-first test runner with excellent TypeScript support
- **Testing Library** - Component testing utilities

> **注**：旧文档曾提及 `@ai-sdk/provider-utils/test` 提供的 `createTestServer` mock server 工具。该包已被移出项目依赖（`package.json` 中不存在，源码中无任何 import），此模式**已失效**。当前项目的 API 测试使用 Vitest 内置 mock 能力（`vi.mock` / `vi.spyOn` / `vi.fn`）配合手动构造的 fetch stub 或真实 HTTP 层，见下文「Mock 策略」。

### Test Configuration
```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    env: {
      NODE_ENV: 'test',
    },
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', 'dist', 'release', '.erb'],
  }
})
```

### Test Commands
- `npm run test` - Run all tests once
- `npm run test:watch` - Run tests in watch mode
- `npm run test:ui` - Launch Vitest UI for interactive testing
- `npm run test:coverage` - Run tests with coverage report

## Existing Test Coverage

### ✅ Completed Tests

1. **AI Provider Adapters** (`src/shared/models/`)
   - OpenAI streaming and tool calls
   - Error handling (rate limits, network errors)
   - Message format conversion
   - Stream parsing and response handling

2. **Utility Functions** (`src/shared/utils/`)
   - API URL normalization (`llm_utils.test.ts`)
   - Message sequencing and merging
   - ContentParts array handling

3. **Content Processing** (`src/renderer/`)
   - Base64 image parsing (`base64.test.ts`)
   - LaTeX rendering (`latex.test.ts`)
   - Provider configuration parsing (`provider-config.test.ts`)

4. **Message Handling** (`src/renderer/utils/`)
   - Message role sequencing
   - Empty message filtering
   - Multi-part content merging
   - Image content handling

## Testing Patterns and Best Practices

### Mock Server Pattern

> **已失效**：本小节原描述 `@ai-sdk/provider-utils/test` 的 `createTestServer()` mock server 模式。该依赖已从项目移除，以下示例仅供历史参考，**不可再使用**。

```typescript
// 历史示例（已不适用）——旧清单曾这样描述
import { createTestServer } from '@ai-sdk/provider-utils/test'

const server = createTestServer({
  'https://api.openai.com/v1/chat/completions': {
    headers: { 'Content-Type': 'text/event-stream' },
    chunks: ['data: {"id":"1","object":"chat.completion.chunk","choices":[{"delta":{"content":"Hello"}}]}\n\n', 'data: [DONE]\n\n']
  }
})
```

**项目实际做法**：基于 Vitest 的 `vi.stubGlobal('fetch', ...)` 或注入 mock 的 HTTP 客户端，手动构造响应。例如测试流式解析时，stub 全局 `fetch` 返回一个 `ReadableStream`，再用 `for await` 消费；工具/错误分支则返回不同的 mock 响应体。这类手动 mock 已覆盖于 `src/shared/utils/`、`src/renderer/` 的既有测试。

### Handling Dynamic Responses (history)

按调用次数返回不同响应，同样用 Vitest 的 mock 函数 + 计数器实现，不依赖已移除的 `createTestServer` 的 `callNumber` 参数。

### Environment-Aware Code
Suppress console output in tests:

```typescript
if (process.env.NODE_ENV !== 'test') {
  console.error('Error message')
}
```

## Test Coverage Goals

### High Priority (Core Functionality)
- [x] AI provider adapters - Basic streaming and error handling
- [x] Message processing core logic
- [ ] Data storage layer (BaseStorage)
- [ ] Session management
- [ ] Settings management

### Medium Priority (Features)
- [x] Content rendering (LaTeX, Markdown basics)
- [x] Provider configuration
- [ ] File processing and uploads
- [ ] Knowledge base integration
- [ ] MCP server communication

### Low Priority (Extensions)
- [ ] UI component testing
- [ ] Electron main process testing
- [ ] Platform-specific features
- [ ] Performance benchmarks

## Implementation Guidelines

### 1. Test Structure
- Place test files alongside source files with `.test.ts` extension
- Use descriptive test names that explain the expected behavior
- Group related tests using `describe` blocks

### 2. Mock Strategy
- Use real fetch with mock servers for API testing
- Avoid mocking internal modules unless necessary
- Create reusable test fixtures for common data

### 3. Async Testing
- Always await async operations
- Use proper cleanup in afterEach hooks
- Handle streaming responses correctly

### 4. Type Safety
- Never use `any` type in tests
- Ensure all mocks match actual type signatures
- Use type assertions sparingly and correctly

## Migration from Jest

The project has been successfully migrated from Jest to Vitest for better ESM support and modern tooling:

1. **Key Changes**
   - Replaced Jest configuration with Vitest config
   - Updated test scripts in package.json
   - Moved to Vitest-based mocking (the former `@ai-sdk/provider-utils/test` mock server utilities are no longer in the dependency tree)
   - Updated test expectations for new data structures

2. **Benefits**
   - Native ESM support
   - Faster test execution
   - Better TypeScript integration
   - Interactive UI for test debugging

## Next Steps

1. **Immediate Actions**
   - Add tests for data storage layer
   - Test session lifecycle management
   - Verify settings persistence

2. **Short-term Goals**
   - Achieve 70% code coverage for core modules
   - Add integration tests for critical user flows
   - Set up automated test runs in CI/CD

3. **Long-term Vision**
   - Comprehensive E2E testing with Playwright
   - Performance regression testing
   - Cross-platform compatibility testing

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [AI SDK Testing Guide](https://sdk.vercel.ai/docs/testing)
- [Testing Library](https://testing-library.com/)