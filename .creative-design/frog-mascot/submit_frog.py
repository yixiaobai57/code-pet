# 奶蛙资产写入画布（create-batch）→ get 回读核对
import json
import subprocess
from pathlib import Path

workdir = Path(__file__).resolve().parent
cli_entry = ["design-cli"]
workspace_id = "cws_60646974125798658"

xml_text = """<batch>
  <items>
    <item type="IMAGE" path="/deliverables/frog-mascot" title="奶蛙待机" brief="奶蛙桌宠 idle 贴图：参考用户参考图生成，深灰西装+白衬衫+酒红领带+绿眼，透明背景（中灰色底 RGB 分段色键抠图），2048x2048">
      <size width="2048" height="2048" />
      <asset url="https://aka.doubaocdn.com/s/AiYQt99re5" />
    </item>
    <item type="IMAGE" path="/deliverables/frog-mascot" title="奶蛙跑态" brief="奶蛙桌宠 running 贴图：同一角色奔跑姿态，服装与配色一致，透明背景（中灰色底 RGB 分段色键抠图），2048x2048">
      <size width="2048" height="2048" />
      <asset url="https://aka.doubaocdn.com/s/JFVn2yUHbL" />
    </item>
  </items>
  <frames></frames>
</batch>"""

payload = xml_text.encode("utf-8")
argv = cli_entry + ["design-workspace", "+create-batch",
                    "--canvas-workspace-id", workspace_id, "--input", "-"]
result = subprocess.run(argv, input=payload, shell=False, cwd=workdir,
                        capture_output=True, timeout=120)
(workdir / "frog-create.stdout.bin").write_bytes(result.stdout)
(workdir / "frog-create.stderr.bin").write_bytes(result.stderr)
(workdir / "frog-create.exitcode.txt").write_text(str(result.returncode), encoding="utf-8")
print("exitcode:", result.returncode)
print("stdout:", result.stdout.decode("utf-8", errors="strict")[:4000])
print("stderr:", result.stderr.decode("utf-8", errors="strict")[:2000])
