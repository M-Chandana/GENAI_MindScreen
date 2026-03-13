from reportlab.pdfgen import canvas
import io

def test_pdf():
    try:
        buffer = io.BytesIO()
        c = canvas.Canvas(buffer)
        c.drawString(100, 750, "Hello World")
        c.save()
        print("Success: PDF generated")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_pdf()
