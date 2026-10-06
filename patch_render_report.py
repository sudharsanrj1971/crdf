import codecs
import sys
import shutil
import os

with codecs.open('render_report.py', 'r', 'utf-8') as f:
    content = f.read()

target = """    if not output_path:
        out_dir = Path("output")
        out_dir.mkdir(exist_ok=True)
        output_path = str(out_dir / f"CRDF_Report_{slug}_{timestamp_str}.pdf")
    else:
        Path(output_path).parent.mkdir(parents=True, exist_ok=True)

    temp_dir = Path("output/temp_charts")
    temp_dir.mkdir(parents=True, exist_ok=True)
    chart_paths = generate_charts(report_md, temp_dir)

    margin = 36  # 0.5 inch margins for clean professional layout

    doc = SimpleDocTemplate(
        output_path,
        pagesize=letter,"""

replacement = """    if not output_path:
        out_dir = Path("output")
        out_dir.mkdir(exist_ok=True)
        output_path = str(out_dir / f"CRDF_Report_{slug}_{timestamp_str}.pdf")
    else:
        Path(output_path).parent.mkdir(parents=True, exist_ok=True)

    temp_output_path = output_path + ".tmp"

    temp_dir = Path("output/temp_charts")
    temp_dir.mkdir(parents=True, exist_ok=True)
    chart_paths = generate_charts(report_md, temp_dir)

    margin = 36  # 0.5 inch margins for clean professional layout

    doc = SimpleDocTemplate(
        temp_output_path,
        pagesize=letter,"""

if target in content:
    content = content.replace(target, replacement)
else:
    print("Target 1 not found!")
    sys.exit(1)

target2 = """    doc.build(flowables)
    
    # Cleanup temp charts"""

replacement2 = """    doc.build(flowables)
    
    import shutil
    shutil.move(temp_output_path, output_path)
    
    # Cleanup temp charts"""

if target2 in content:
    content = content.replace(target2, replacement2)
else:
    print("Target 2 not found!")
    sys.exit(1)

with codecs.open('render_report.py', 'w', 'utf-8') as f:
    f.write(content)
print("Successfully patched render_report.py")
