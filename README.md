# Fetch URL Challenge 

The challenge: Implement a function that fetches a list of URLs concurrently respecting the API limitations. 

## Guide

### Step 1: Setup

This interview uses a locally-running server running on `localhost:3000` that your solution code will communicate with. To start it, in a separate terminal type:

```bash
cd typescript
npm install
npm run server          # keep running in a terminal
```

Open another terminal window in this folder that you can use to test your solution later.

For Python, open up `python/solution.py`

For Typescript, open up `typescript/solution.py`

For Go, open up `go/solution.go`

### How to Run Your Solution

First, make sure your server from above is running in another terminal window.
Second, in a new terminal window, use the following commands

**TypeScript**

```bash
cd typescript
npx tsx run.ts                              # default: ./solution.ts
npx tsx run.ts path/to/solution.ts          # or specify a file
```

**Python**

```bash
cd python
uv run run.py                               # default: ./solution.py
uv run run.py path/to/solution.py           # or specify a file
```

**Go**
```bash
cd go
go run .                                    # runs go/solution.go
```

Use `run` to iterate on your solution — it prints each result so you can see
what's happening. Use the test harness when you're ready to validate.

If you need to log to stdout, the typical ways will work:
**Typescript**
```javascript
console.log("foo")
```

**Python**
```python
print("bar")
```

**Go**
```go
fmt.Println("baz")
```
