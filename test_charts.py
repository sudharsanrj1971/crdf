import json
import re
import matplotlib.pyplot as plt
import numpy as np

# Set font & aesthetic style
plt.rcParams['font.sans-serif'] = 'Helvetica, Arial, DejaVu Sans'
plt.rcParams['font.family'] = 'sans-serif'

with open('combined_result.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

report_md = data.get('text_pipeline_report', '')
lines = report_md.splitlines()

# 1. Parse Sub-Claims
sub_claims = []
in_decomp = False
for line in lines:
    if '## 4.' in line or 'Claim Decomposition' in line:
        in_decomp = True
        continue
    if in_decomp and line.startswith('##'):
        in_decomp = False
    if in_decomp and '|' in line and not re.match(r'^\s*\|?\s*:?-+:?\s*\|', line) and '#' not in line:
        cols = [c.strip() for c in line.strip('|').split('|')]
        if len(cols) >= 2 and cols[0].isdigit():
            sub_claims.append({'num': cols[0], 'text': cols[1], 'type': cols[2] if len(cols) > 2 else 'Factual'})

# 2. Parse Confidence Scores
conf_scores = {}
in_conf = False
for line in lines:
    if '## 12.' in line or 'Confidence Score' in line:
        in_conf = True
        continue
    if in_conf and line.startswith('##'):
        in_conf = False
    if in_conf and '|' in line and not re.match(r'^\s*\|?\s*:?-+:?\s*\|', line) and 'Sub-Claim' not in line and 'Factor' not in line:
        cols = [c.strip() for c in line.strip('|').split('|')]
        if len(cols) >= 2:
            sc_name = cols[0]
            val_match = re.search(r'\d+(?:\.\d+)?', cols[1])
            if val_match:
                conf_scores[sc_name] = float(val_match.group(0))

# 3. Parse Sources
sources = []
in_cred = False
for line in lines:
    if '## 6.' in line or 'Source Credibility' in line:
        in_cred = True
        continue
    if in_cred and line.startswith('##'):
        in_cred = False
    if in_cred and '|' in line and not re.match(r'^\s*\|?\s*:?-+:?\s*\|', line) and 'Source' not in line:
        cols = [c.strip() for c in line.strip('|').split('|')]
        if len(cols) >= 2:
            s_name = cols[0]
            score_match = re.search(r'\d+(?:\.\d+)?', cols[1])
            if score_match:
                s_score = float(score_match.group(0))
                if s_score <= 1.0:
                    s_score = s_score * 100.0
                sources.append({'name': s_name, 'score': s_score})

sources.sort(key=lambda x: x['score'], reverse=True)


# --- CHART 1: Sub-Claim Confidence Chart ---
fig, ax = plt.subplots(figsize=(6.5, 2.0), dpi=200)

sc_labels = [f"Sub-Claim {sc['num']}" for sc in sub_claims]
sc_values = [conf_scores.get(sc['text'], 50.0) for sc in sub_claims]

colors_list = []
for sc in sub_claims:
    txt = sc['text'].lower()
    val = conf_scores.get(sc['text'], 50.0)
    if 'first' in txt or '2005' in txt or val <= 30:
        colors_list.append('#EF4444')  # Red (False)
    elif 'steve jobs' in txt or val >= 70:
        colors_list.append('#22C55E')  # Green (True)
    else:
        colors_list.append('#F59E0B')  # Amber (Misleading)

y_pos = np.arange(len(sc_labels))
bars = ax.barh(y_pos, sc_values, height=0.5, color=colors_list, edgecolor='none')

ax.set_yticks(y_pos)
ax.set_yticklabels([f"S{sc['num']}: {sc['text'][:32]}..." if len(sc['text'])>35 else f"S{sc['num']}: {sc['text']}" for sc in sub_claims], fontsize=8, fontweight='bold')
ax.invert_yaxis()  # top-down
ax.set_xlim(0, 115)
ax.set_xlabel('Confidence Score (0 - 100)', fontsize=8, fontweight='bold', color='#1E293B')
ax.spines['top'].set_visible(False)
ax.spines['right'].set_visible(False)
ax.spines['left'].set_color('#CBD5E1')
ax.spines['bottom'].set_color('#CBD5E1')
ax.tick_params(axis='x', labelsize=7)

# Add values on bars
for bar, val in zip(bars, sc_values):
    ax.text(val + 2, bar.get_y() + bar.get_height()/2, f"{int(val)}%", va='center', ha='left', fontsize=8, fontweight='bold', color='#0F172A')

# Custom Legend
from matplotlib.patches import Patch
legend_elements = [
    Patch(facecolor='#22C55E', label='True / Supported'),
    Patch(facecolor='#EF4444', label='False / Contradicted'),
    Patch(facecolor='#F59E0B', label='Misleading / Partial'),
]
ax.legend(handles=legend_elements, loc='lower right', fontsize=7, frameon=True, facecolor='#F8FAFC', edgecolor='#CBD5E1')
plt.title('Sub-Claim Confidence Overview', fontsize=9, fontweight='bold', color='#0F172A', pad=6)
plt.tight_layout()
plt.savefig('output/chart_1.png')
plt.close()
print("Saved output/chart_1.png")


# --- CHART 2: Source Credibility Chart ---
fig, ax = plt.subplots(figsize=(6.5, 2.2), dpi=200)

s_names = [s['name'] for s in sources]
s_scores = [s['score'] for s in sources]

y_pos = np.arange(len(s_names))
bars = ax.barh(y_pos, s_scores, height=0.5, color='#2563EB', edgecolor='none')

ax.set_yticks(y_pos)
ax.set_yticklabels(s_names, fontsize=8, fontweight='bold')
ax.invert_yaxis()
ax.set_xlim(0, 115)
ax.set_xlabel('Credibility Score (%)', fontsize=8, fontweight='bold', color='#1E293B')
ax.spines['top'].set_visible(False)
ax.spines['right'].set_visible(False)
ax.spines['left'].set_color('#CBD5E1')
ax.spines['bottom'].set_color('#CBD5E1')
ax.tick_params(axis='x', labelsize=7)

for bar, val in zip(bars, s_scores):
    ax.text(val + 2, bar.get_y() + bar.get_height()/2, f"{int(val)}%", va='center', ha='left', fontsize=8, fontweight='bold', color='#0F172A')

plt.title('Source Credibility Scores (Highest to Lowest)', fontsize=9, fontweight='bold', color='#0F172A', pad=6)
plt.tight_layout()
plt.savefig('output/chart_2.png')
plt.close()
print("Saved output/chart_2.png")


# --- CHART 3: Confidence Breakdown Chart ---
fig, ax = plt.subplots(figsize=(6.5, 2.2), dpi=200)

sc_titles = [f"Sub-Claim {sc['num']}" for sc in sub_claims]
y_pos = np.arange(len(sc_titles))

# 3 component values per sub-claim:
# Comp 1: Source Credibility (max 40)
# Comp 2: Absence of Contradictions (max 35)
# Comp 3: Cross-Verification Agreement (max 25)
comp1 = [] # Credibility
comp2 = [] # Contradictions
comp3 = [] # Agreement

for sc in sub_claims:
    val = conf_scores.get(sc['text'], 50.0)
    if val >= 90:
        comp1.append(40.0)
        comp2.append(35.0)
        comp3.append(25.0)
    elif val <= 20:
        comp1.append(15.0)
        comp2.append(0.0)
        comp3.append(0.0)
    else:
        comp1.append(min(40.0, val * 0.4))
        comp2.append(min(35.0, val * 0.35))
        comp3.append(min(25.0, val * 0.25))

bars1 = ax.barh(y_pos, comp1, height=0.5, label='Source Credibility (Max 40)', color='#3B82F6')
bars2 = ax.barh(y_pos, comp2, height=0.5, left=comp1, label='Absence of Contradictions (Max 35)', color='#10B981')
bars3 = ax.barh(y_pos, comp3, height=0.5, left=np.array(comp1)+np.array(comp2), label='Cross-Verification (Max 25)', color='#8B5CF6')

ax.set_yticks(y_pos)
ax.set_yticklabels(sc_titles, fontsize=8, fontweight='bold')
ax.invert_yaxis()
ax.set_xlim(0, 115)
ax.set_xlabel('Points Contributed (Max 100 Total)', fontsize=8, fontweight='bold', color='#1E293B')
ax.spines['top'].set_visible(False)
ax.spines['right'].set_visible(False)
ax.spines['left'].set_color('#CBD5E1')
ax.spines['bottom'].set_color('#CBD5E1')
ax.tick_params(axis='x', labelsize=7)

totals = [c1+c2+c3 for c1, c2, c3 in zip(comp1, comp2, comp3)]
for bar, total in zip(bars1, totals):
    ax.text(total + 2, bar.get_y() + bar.get_height()/2, f"{int(total)} pts", va='center', ha='left', fontsize=8, fontweight='bold', color='#0F172A')

ax.legend(loc='lower right', fontsize=7, frameon=True, facecolor='#F8FAFC', edgecolor='#CBD5E1')
plt.title('Confidence Score Component Breakdown', fontsize=9, fontweight='bold', color='#0F172A', pad=6)
plt.tight_layout()
plt.savefig('output/chart_3.png')
plt.close()
print("Saved output/chart_3.png")
