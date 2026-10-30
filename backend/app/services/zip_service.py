import os
import zipfile
from pathlib import Path
from typing import List
import asyncio

class ZipService:
    @staticmethod
    def create_zip_archive(files: List[str], output_zip_path: str) -> str:
        """Create a compressed zip file from a list of verified local file paths."""
        out_p = Path(output_zip_path)
        out_p.parent.mkdir(parents=True, exist_ok=True)

        with zipfile.ZipFile(out_p, "w", zipfile.ZIP_DEFLATED) as zip_f:
            for file_path in files:
                p = Path(file_path)
                if p.is_file():
                    # Preserve original image bytes
                    zip_f.write(p, arcname=p.name)

        return str(out_p.resolve())

    @staticmethod
    async def create_zip_async(files: List[str], output_zip_path: str) -> str:
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(None, ZipService.create_zip_archive, files, output_zip_path)

zip_service = ZipService()

