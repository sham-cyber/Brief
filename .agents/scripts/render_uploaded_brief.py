from pathlib import Path

import fitz


source = Path("attached_assets/0_Briefing_Agent_(1)_1793712109152.pdf")
output_dir = Path(".agents/outputs/briefing-print")
output_dir.mkdir(parents=True, exist_ok=True)

document = fitz.open(source)
print(f"Pages: {document.page_count}")
for page_number, page in enumerate(document, start=1):
    pixmap = page.get_pixmap(matrix=fitz.Matrix(1.5, 1.5), alpha=False)
    output = output_dir / f"page-{page_number}.png"
    pixmap.save(output)
    print(f"Page {page_number}: {page.rect.width:.0f} x {page.rect.height:.0f} pt -> {output}")
