import urllib.request
import time

def run():
    print("Testing...")
    time.sleep(2)
    resp = urllib.request.urlopen("http://localhost:8000/index.html")
    content = resp.read().decode('utf-8')
    assert "Cache-Control" in resp.headers
    assert "X-Content-Type-Options" in resp.headers
    print("Test finished")

if __name__ == "__main__":
    run()
