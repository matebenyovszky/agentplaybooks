import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { runDoctor, publicReport } from "../src/doctor.js";

test("ROS 2 Doctor inventories without executing launch code and reports unsafe declarations", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "apb-ros2-"));
  const packageRoot = path.join(root, "src", "robot_demo");
  await mkdir(packageRoot, { recursive: true });
  await writeFile(path.join(packageRoot, "package.xml"), '<package format="3"><name>robot_demo</name><version>0.1.0</version><license>MIT</license><maintainer email="demo@example.test">Demo</maintainer></package>');
  await writeFile(path.join(packageRoot, "robot.launch.py"), 'raise RuntimeError("Doctor must not execute launch files")');
  await writeFile(path.join(root, "agentplaybook.json"), JSON.stringify({ spec: {
    targets: [{ type: "ros2", enabled: true }], policies: { physicalActions: "allowlist", emergencyStopRequired: false },
  } }));
  const report = publicReport(await runDoctor(root, { robotics: true }));
  assert.equal(report.robotics.runtimeChecked, false);
  assert.equal(report.robotics.packages[0].name, "robot_demo");
  assert.deepEqual(report.robotics.launchFiles, ["src/robot_demo/robot.launch.py"]);
  assert.ok(report.findings.some(item => item.code === "ros2.policy.emergency-stop-missing"));
});

test("ROS 2 inventory does not assemble XML tags across removed comments", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "apb-ros2-comments-"));
  const filename = path.join(root, "package.xml");
  await writeFile(filename, '<package><na<!-- comment -->me>not_a_real_name_tag</name></package>');
  const invalid = publicReport(await runDoctor(root, { robotics: true }));
  assert.deepEqual(invalid.robotics.packages, []);
  assert.ok(invalid.findings.some(item => item.code === "ros2.package.invalid"));
  await writeFile(filename, '<package><!-- <name>ignored</name> --><name>real_robot</name></package>');
  const valid = publicReport(await runDoctor(root, { robotics: true }));
  assert.equal(valid.robotics.packages[0].name, "real_robot");
});
