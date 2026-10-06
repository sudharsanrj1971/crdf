"""
Patch crew.jsonc in-place to:
1. Update claim_intake_specialist to handle 'Claim:' / 'Multimodal Context:' prefix format.
2. Update claim_decomposer to only decompose 'Claim:' portion and treat 'Multimodal Context:' as background.
"""
import codecs

with codecs.open('crew.jsonc', 'r', 'utf-8') as f:
    content = f.read()

# --- Fix 1: claim_intake_specialist description ---
OLD_INTAKE = (
    'Take the raw user claim: {claim}. Clean up any grammar or informal language without changing its meaning. '
    'Determine if it is a genuine checkable factual claim, as opposed to a question, greeting, empty input, or '
    'pure opinion/prediction. If the claim is ambiguous (missing a critical name, date, or location needed to '
    'verify it), do not guess \u00e2\u20ac\u201d instead ask exactly one clarifying question. If the input is not '
    'a checkable claim at all, reject it and explain why in one sentence. Output the cleaned claim text along '
    'with a boolean field ready_for_processing that is true only when the claim is clear enough to move to decomposition.'
)

NEW_INTAKE = (
    'Take the raw user input: {claim}, which may contain a \'Claim:\' section and a \'Multimodal Context:\' section. '
    'Clean up any grammar or informal language in the \'Claim:\' portion without changing its meaning. '
    'Preserve the \'Multimodal Context:\' portion exactly as-is at the end of the string. '
    'Determine if the Claim portion is a genuine checkable factual claim, as opposed to a question, greeting, '
    'empty input, or pure opinion/prediction. If the claim is ambiguous (missing a critical name, date, or '
    'location needed to verify it), do not guess \u2014 instead ask exactly one clarifying question. '
    'If the input is not a checkable claim at all, reject it and explain why in one sentence. '
    'Output the combined text as the cleaned claim text along with a boolean field ready_for_processing '
    'that is true only when the claim is clear enough to move to decomposition.'
)

if OLD_INTAKE in content:
    content = content.replace(OLD_INTAKE, NEW_INTAKE)
    print("Patched claim_intake_specialist description.")
else:
    # Try with the Windows encoded em-dash variant
    OLD_INTAKE2 = OLD_INTAKE.replace('\u00e2\u20ac\u201d', '\u2014')
    if OLD_INTAKE2 in content:
        content = content.replace(OLD_INTAKE2, NEW_INTAKE)
        print("Patched claim_intake_specialist description (em-dash variant).")
    else:
        print("WARNING: claim_intake_specialist old text NOT found in file!")

# --- Fix 2: claim_decomposer description ---
OLD_DECOMPOSE = (
    'break it into the smallest set of independently verifiable sub-claims (maximum 7). '
    'Clearly separate factual assertions from opinions or predictions. IMPORTANT: every assertion in the claim '
    'must appear as a sub-claim, including opinions and predictions'
)

NEW_DECOMPOSE = (
    'break ONLY the \'Claim:\' portion into the smallest set of independently verifiable sub-claims (maximum 7). '
    'DO NOT create any sub-claims from the \'Multimodal Context:\' section; treat that text solely as background '
    'information for downstream agents. '
    'Clearly separate factual assertions from opinions or predictions. IMPORTANT: every assertion in the claim '
    'must appear as a sub-claim, including opinions and predictions'
)

if OLD_DECOMPOSE in content:
    content = content.replace(OLD_DECOMPOSE, NEW_DECOMPOSE)
    print("Patched claim_decomposer description.")
else:
    print("WARNING: claim_decomposer old text NOT found in file!")

with codecs.open('crew.jsonc', 'w', 'utf-8') as f:
    f.write(content)
print("Done.")
