# City Services Insight Dashboard ## Running the Program

1. Launch a new notebook in Google Colab
2. Upload your incidents_XXXXX.csv and zones_XXXXX.geojson files 
3. Copy the code and insert into one cell and change the file names at the top to match with your seed number
4. Execute the cell and answer the filter questions
5. The dashboard is inline and saved as dashboard.html ## Abhängigkeiten
pandas numpy geopandas shapely plotly automatically installed## Tools Used For AI
Claude (Anthropic)# What Worked:
- Pipeline for data cleaning
- Choropleth map of SLA compliance
- Menu of runtime filtering## What Went Wrong?
- ipywidgets buttons not reliable in Colab, replaced simple input menu
- You'll need to run the cell again to update filters