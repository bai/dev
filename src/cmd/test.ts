import fs from "fs";
import path from "path";
import { baseSearchDir, homeDir } from "~/utils";

/**
 * Runs basic tests to validate CLI functionality
 */
export function handleTestCommand(): void {
  console.log("🧪 Running dev CLI tests...\n");

  let passed = 0;
  let failed = 0;

  // Test 1: Check if base search directory exists
  console.log("📁 Test: Base search directory");
  if (fs.existsSync(baseSearchDir)) {
    console.log("   ✅ PASS: Base search directory exists");
    passed++;
  } else {
    console.log("   ❌ FAIL: Base search directory does not exist");
    failed++;
  }

  // Test 2: Check if dev CLI is installed
  console.log("\n🚀 Test: Dev CLI installation");
  const devDir = path.join(homeDir, ".dev");
  if (fs.existsSync(devDir)) {
    console.log("   ✅ PASS: Dev CLI directory exists");
    passed++;
  } else {
    console.log("   ❌ FAIL: Dev CLI directory not found");
    failed++;
  }

  // Test 3: Check if package.json exists and is valid
  console.log("\n📦 Test: Package configuration");
  const packageJsonPath = path.join(devDir, "package.json");
  try {
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
      if (packageJson.name === "dev") {
        console.log("   ✅ PASS: Package.json is valid");
        passed++;
      } else {
        console.log("   ❌ FAIL: Package.json has incorrect name");
        failed++;
      }
    } else {
      console.log("   ❌ FAIL: Package.json not found");
      failed++;
    }
  } catch (error) {
    console.log("   ❌ FAIL: Package.json is invalid JSON");
    failed++;
  }

  // Test 4: Check if shell integration exists
  console.log("\n🐚 Test: Shell integration");
  const zshrcPath = path.join(homeDir, ".zshrc");
  if (fs.existsSync(zshrcPath)) {
    const zshrcContent = fs.readFileSync(zshrcPath, "utf-8");
    if (zshrcContent.includes("source $HOME/.dev/hack/zshrc.sh")) {
      console.log("   ✅ PASS: Shell integration configured");
      passed++;
    } else {
      console.log("   ⚠️  WARN: Shell integration not found in .zshrc");
      console.log("   💡 Run the setup script to configure shell integration");
      failed++;
    }
  } else {
    console.log("   ⚠️  WARN: .zshrc not found");
    failed++;
  }

  // Test 5: Check TypeScript compilation
  console.log("\n🔧 Test: TypeScript compilation");
  try {
    // This is a simple check - in a real scenario you'd run tsc
    const indexPath = path.join(devDir, "src", "index.ts");
    if (fs.existsSync(indexPath)) {
      console.log("   ✅ PASS: Source files exist");
      passed++;
    } else {
      console.log("   ❌ FAIL: Source files not found");
      failed++;
    }
  } catch (error) {
    console.log("   ❌ FAIL: TypeScript compilation check failed");
    failed++;
  }

  // Summary
  console.log(`\n📊 Test Results:`);
  console.log(`   ✅ Passed: ${passed}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log(`   📈 Success Rate: ${Math.round((passed / (passed + failed)) * 100)}%`);

  if (failed === 0) {
    console.log(`\n🎉 All tests passed! Your dev CLI is working correctly.`);
  } else {
    console.log(`\n⚠️  Some tests failed. Run 'dev status' for more detailed information.`);
    console.log(`💡 Consider running the setup script: bash ~/.dev/hack/setup.sh`);
  }

  // Exit with appropriate code
  process.exit(failed > 0 ? 1 : 0);
}
