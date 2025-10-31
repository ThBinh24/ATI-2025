from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

def add_cors(app: FastAPI):
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],  # tạm thời mở, sau hạn chế theo domain FE
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )