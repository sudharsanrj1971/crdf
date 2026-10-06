from fastapi import FastAPI
from pydantic import BaseModel
from your_crew_module import YourCrew

app = FastAPI()

class ClaimRequest(BaseModel):
    session_id: str
    claim: str
    document_file: str = "none"
    image_file: str = "none"
    video_file: str = "none"

@app.post("/verify")
def verify_claim(req: ClaimRequest):
    result = YourCrew().crew().kickoff(inputs=req.dict())
    return {"result": result}